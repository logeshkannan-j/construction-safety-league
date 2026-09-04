import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build use relative asset paths, so it works whether
// GitHub Pages serves it at the root of a domain or under /your-repo-name/.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
