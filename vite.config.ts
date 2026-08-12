import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// base : '/<nom-du-depot>/' sur GitHub Pages, '/' avec un domaine personnalisé.
const BASE = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base: BASE,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },

  // @sqlite.org/sqlite-wasm ne doit pas être pré-bundlé : il charge son .wasm à côté.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },

  worker: { format: 'es' },

  plugins: [
    react(),
    VitePWA({
      // `injectManifest` : le service worker porte du code propre — réception
      // des push et déchiffrement du contenu utile (§10.3).
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        // Le bundle catalogue est téléchargé et importé par l'app (spec §5.5),
        // pas mis en cache par Workbox : trop gros et géré par version.
        globIgnores: ['**/bundles/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: 'Medco',
        short_name: 'Medco',
        description: 'Suivi de consommation médicamenteuse',
        lang: 'fr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F1F6F9', // fond de la maquette
        theme_color: '#F1F6F9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
