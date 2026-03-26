import { defineConfig } from "vite";

export default defineConfig({
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
