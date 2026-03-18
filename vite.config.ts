import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { deckspertApiPlugin } from "./api/devPlugin";

export default defineConfig({
  root: "apps/web",
  plugins: [react(), deckspertApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/delivery-coach")
    }
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true
  },
  server: {
    port: 3000
  }
});
