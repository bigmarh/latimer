import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const uuidShimEntry = fileURLToPath(new URL("./src/shims/uuid.ts", import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    solid(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.+/,
            handler: 'NetworkFirst',
            options: { cacheName: 'external', networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
  define: {
    "process.env": "{}",
    global: "globalThis",
  },
  resolve: {
    conditions: ["browser", "import", "module", "default"],
    alias: {
      uuid: uuidShimEntry,
    },
  },
  optimizeDeps: {
    include: ["solid-js", "solid-js/web"],
  },
});
