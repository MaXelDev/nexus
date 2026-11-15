import { defineConfig } from "vite";
// NEXUS Android frontend. Imports shared code from ../src (format, icons, demo data).
// TAURI_DEV_HOST: set by `tauri android dev` so the phone can reach the dev server.
const host = process.env.TAURI_DEV_HOST;
export default defineConfig({
  root: __dirname,
  clearScreen: false,
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 1430, strictPort: true, host: host || false, hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] } },
});
