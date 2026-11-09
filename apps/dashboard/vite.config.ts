import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// L'API passa dal proxy: dashboard e API sullo stesso sito, come servirà per il cookie
// di sessione del magic link (SameSite=Lax, vedi new-plan.md, Fase 6).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/v2": process.env.API_PROXY_TARGET ?? "http://localhost:3001",
    },
  },
});
