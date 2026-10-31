import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true },
  server: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../node_modules", import.meta.url)),
      ],
      deny: [".env", ".env.*", "**/.env*", "*.{crt,pem}", "**/.git/**"],
    },
  },
});
