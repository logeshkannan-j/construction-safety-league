import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * public/models holds the raw 3D sources (176 MB). They are kept out of
 * git, and they must never be shipped either: Vite copies all of public/
 * into the build, so this removes them again. The app loads the
 * web-sized copies in public/models-web.
 */
function dropRawModels() {
  let outDir = "dist";
  return {
    name: "drop-raw-models",
    apply: "build",
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const raw = path.resolve(outDir, "models");
      if (fs.existsSync(raw)) fs.rmSync(raw, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), dropRawModels()],
  base: "/construction-safety-league/",
  build: {
    rollupOptions: {
      output: {
        // Keep the three big dependency groups in their own chunks so a
        // player who only opens the quiz never downloads three.js, and a
        // player who only opens the Gaming Arena does not re-download
        // the 3D engine when switching between games.
        // Exact package names. A substring test put @react-three/fiber and
        // react-reconciler into "react", and three-stdlib into "three",
        // so every player downloaded the model viewer's libraries.
        manualChunks(id) {
          // three's core only: its example loaders go with whatever
          // uses them, so the viewer's OBJ and MTL loaders stay in the
          // viewer's own chunk.
          if (/node_modules[\/]three[\/]build[\/]/.test(id)) return "three";
          if (/node_modules[\/](@firebase|firebase)[\/]/.test(id)) return "firebase";
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "react";
        },
      },
    },
    // three.js is a single large library; the warning adds nothing once
    // it has its own cacheable chunk.
    chunkSizeWarningLimit: 800,
  },
});
