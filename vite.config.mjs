import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import {
  MAX_PAGES_ASSET_BYTES,
  RAW_STL_BASE,
} from "./scripts/pages-asset-limits.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Cloudflare Pages : max 25 MiB par fichier. Les STL plus lourds sont chargés
 * depuis raw.githubusercontent.com (même dépôt) ; trim-dist-for-pages.mjs les retire de dist/.
 */
function externalizeLargeStlsForPages() {
  return {
    name: "externalize-large-stls-for-pages",
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      const stlDir = path.join(__dirname, "public", "models", "stl");
      if (!fs.existsSync(stlDir)) return html;
      let out = html;
      for (const name of fs.readdirSync(stlDir)) {
        if (!name.endsWith(".stl")) continue;
        const fp = path.join(stlDir, name);
        if (fs.statSync(fp).size <= MAX_PAGES_ASSET_BYTES) continue;
        const rel = `/models/stl/${name}`;
        const abs = `${RAW_STL_BASE}${encodeURIComponent(name)}`;
        out = out.split(`data-stl-url="${rel}"`).join(`data-stl-url="${abs}"`);
      }
      return out;
    },
  };
}

export default defineConfig({
  plugins: [externalizeLargeStlsForPages()],
  // Chemins relatifs (./assets/...) : évite les 404 si la build est ouverte hors racine du domaine
  base: "./",
  server: {
    port: 8765,
    host: "127.0.0.1",
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three";
          }
        },
      },
    },
  },
});
