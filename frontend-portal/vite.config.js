import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'بوابة العميل — مركز رعاية النوادر البيطري',
        short_name: 'بوابة العميل',
        description: 'اطّلع على تقاريرك المخبرية من مركز رعاية النوادر البيطري',
        theme_color: '#302419',
        background_color: '#FDFAF3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/login',
        scope: '/',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          { src: 'logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
