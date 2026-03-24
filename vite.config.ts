import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const require = createRequire(import.meta.url);
const uuidPackageRoot = dirname(require.resolve("uuid/package.json"));
const uuidBrowserEntry = join(uuidPackageRoot, "dist/esm-browser/index.js");

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
      uuid: uuidBrowserEntry,
    },
  },
  optimizeDeps: {
    include: ["solid-js", "solid-js/web"],
  },
});
