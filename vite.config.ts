import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// base : '/<nom-du-depot>/' sur GitHub Pages, '/' avec un domaine personnalisé.
const BASE = process.env.VITE_BASE ?? '/';

/**
 * GitHub Pages n'a pas de repli SPA : `/pilulier` rechargé directement renvoie
 * 404, puisqu'aucun fichier ne porte ce nom. La convention de Pages est de
 * servir `404.html`, qui est ici une copie d'`index.html` : l'application
 * démarre et le routeur prend la main.
 *
 * Le service worker rend le cas rare une fois l'app installée, mais un lien
 * partagé ou une première visite passent bien par là.
 */
function repliSpa(): Plugin {
  return {
    name: 'medco-repli-spa',
    closeBundle() {
      const sortie = resolve(__dirname, 'dist');
      copyFileSync(resolve(sortie, 'index.html'), resolve(sortie, '404.html'));
    },
  };
}

export default defineConfig({
  base: BASE,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },

  // @sqlite.org/sqlite-wasm ne doit pas être pré-bundlé : il charge son .wasm à côté.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },

  worker: { format: 'es' },

  plugins: [
    react(),
    repliSpa(),
    VitePWA({
      // `injectManifest` : le service worker porte du code propre — réception
      // des push et déchiffrement du contenu utile (§10.3).
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        // Le bundle catalogue est téléchargé et importé par l'app (spec §5.5),
        // pas mis en cache par Workbox : trop gros et géré par version.
        globIgnores: ['**/bundles/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        // `id` fige l'identité de la PWA : sans lui, un changement de
        // `start_url` ferait réinstaller une seconde application (§11.4).
        id: BASE,
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
