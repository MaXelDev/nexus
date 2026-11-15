import { defineConfig } from "vite";
// Fixed port so tauri.conf.json devUrl matches; Tauri watches src-tauri itself.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
});
