/**
 * Après vite build : supprime de dist/ les STL > 25 MiB (incompatibles Cloudflare Pages).
 * Les cartes pointent déjà vers raw.githubusercontent.com via le plugin Vite en build prod.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PAGES_ASSET_BYTES } from "./pages-asset-limits.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distStl = path.join(root, "dist", "models", "stl");

if (!fs.existsSync(distStl)) {
  console.log("[trim-dist-for-pages] dist/models/stl absent, rien à faire.");
  process.exit(0);
}

let removed = 0;
for (const name of fs.readdirSync(distStl)) {
  if (!name.endsWith(".stl")) continue;
  const fp = path.join(distStl, name);
  const stat = fs.statSync(fp);
  if (stat.size > MAX_PAGES_ASSET_BYTES) {
    fs.unlinkSync(fp);
    console.log(
      `[trim-dist-for-pages] retiré ${name} (${stat.size} o > limite Pages), chargement via GitHub raw.`
    );
    removed++;
  }
}
console.log(`[trim-dist-for-pages] terminé (${removed} fichier(s) retiré(s)).`);
