import { defineConfig } from "vite";
import { resolve } from "path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const resolveUuid = () => ({
  name: 'resolve-uuid',
  resolveId(id: string) {
    if (id === 'uuid') {
      return resolve('node_modules/uuid/dist/esm-browser/index.js');
    }
    return null;
  },
});

export default defineConfig({
  plugins: [
    resolveUuid(),
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
    alias: {},
  },
  optimizeDeps: {
    include: ["solid-js", "solid-js/web"],
  },
});
