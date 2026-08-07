import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Cooking Mamacita",
        short_name: "Mamacita",
        description: "Carnet de recettes, garde-manger, menus et courses",
        theme_color: "#C0392B",
        background_color: "#FDF6EC",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Permet de choisir "Cooking Mamacita" dans le menu "Partager" d'une autre appli (Instagram, TikTok,
        // le navigateur...) une fois l'app installée, pour envoyer directement une URL ou un texte de recette
        // vers l'import plutôt que de devoir copier-coller manuellement. GET (pas de Service Worker
        // supplémentaire à écrire) : pas de partage de fichier/photo par ce biais, seulement texte/URL.
        share_target: {
          action: "/share-target",
          method: "GET",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
      },
      workbox: {
        // Les illustrations (~1 Mo au total, converties en WebP) ne sont PAS préchargées au premier lancement —
        // seulement le code et les polices, pour que l'app démarre vite. Les images sont mises en cache à la
        // demande au fur et à mesure qu'on visite les écrans (runtimeCaching ci-dessous), pas toutes d'un coup.
        globPatterns: ["**/*.{js,css,html,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
