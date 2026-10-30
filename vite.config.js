import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/construction-safety-league/",
  build: {
    rollupOptions: {
      output: {
        // Keep the three big dependency groups in their own chunks so a
        // player who only opens the quiz never downloads three.js, and a
        // player who only opens the Gaming Arena does not re-download
        // the 3D engine when switching between games.
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/@firebase") || id.includes("node_modules/firebase")) return "firebase";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
        },
      },
    },
    // three.js is a single large library; the warning adds nothing once
    // it has its own cacheable chunk.
    chunkSizeWarningLimit: 800,
  },
});
