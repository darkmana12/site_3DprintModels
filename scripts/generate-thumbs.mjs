/**
 * Démarre Vite, ouvre thumb-gen.html pour chaque STL listé dans index.html,
 * enregistre des JPEG dans public/models/thumbs/ (même nom de base que le .stl).
 *
 * Prérequis : npm i -D playwright && npx playwright install chromium
 * Fichiers STL : public/models/stl/*.stl
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const INDEX = path.join(root, "index.html");
const OUT_DIR = path.join(root, "public", "models", "thumbs");
const PORT = 9876;
const BASE = `http://127.0.0.1:${PORT}`;

function extractStlUrls(html) {
  const re = /data-stl-url="(\/models\/stl\/[^"]+\.stl)"/gi;
  const urls = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    urls.push(m[1]);
  }
  return [...new Set(urls)];
}

async function waitForServer(url, maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout: serveur inaccessible (${url})`);
}

function startVite() {
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const proc = spawn(process.execPath, [viteBin, "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return proc;
}

async function main() {
  if (!fs.existsSync(INDEX)) {
    console.error("index.html introuvable.");
    process.exit(1);
  }

  const html = fs.readFileSync(INDEX, "utf8");
  let stlUrls = extractStlUrls(html);
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  if (onlyArg) {
    const name = onlyArg.slice(7).replace(/\.stl$/i, "");
    stlUrls = stlUrls.filter((u) => path.basename(u, ".stl") === name);
    if (!stlUrls.length) {
      console.error(`Aucune entrée pour --only=${name} (nom de base du .stl).`);
      process.exit(1);
    }
  }
  if (!stlUrls.length) {
    console.error("Aucune URL data-stl-url dans index.html.");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const viteProc = startVite();
  let browser;

  try {
    await waitForServer(`${BASE}/`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 800, height: 600 });

    for (const stlUrl of stlUrls) {
      const base = path.basename(stlUrl, ".stl");
      const outPath = path.join(OUT_DIR, `${base}.jpg`);
      const pageUrl = `${BASE}/thumb-gen.html?stl=${encodeURIComponent(stlUrl)}`;

      console.log(`→ ${base}`);

      await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 300000 });

      await page.waitForFunction(
        () => window.__THUMB_READY__ === true || window.__THUMB_ERROR__,
        { timeout: 300000 }
      );

      const err = await page.evaluate(() => window.__THUMB_ERROR__);
      if (err) {
        console.error(`  échec : ${err}`);
        continue;
      }

      await page.evaluate(
        () =>
          new Promise((r) => {
            setTimeout(r, 150);
          })
      );

      const canvas = page.locator("canvas#c");
      await canvas.screenshot({
        path: outPath,
        type: "jpeg",
        quality: 88,
      });

      const stat = fs.statSync(outPath);
      if (stat.size < 8000) {
        console.warn(`  fichier petit (${stat.size} o), nouvelle capture…`);
        await page.evaluate(
          () =>
            new Promise((res) => {
              setTimeout(res, 400);
            })
        );
        await canvas.screenshot({
          path: outPath,
          type: "jpeg",
          quality: 88,
        });
      }

      console.log(`  OK → ${path.relative(root, outPath)}`);
    }
  } finally {
    if (browser) await browser.close();
    if (viteProc && !viteProc.killed) {
      viteProc.kill("SIGTERM");
      if (process.platform === "win32") {
        try {
          spawn("taskkill", ["/pid", String(viteProc.pid), "/f", "/t"], {
            stdio: "ignore",
          });
        } catch {
          /* ignore */
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
