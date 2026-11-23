import type { MetadataRoute } from 'next';

// Manifiesto para instalar Cuadra en la pantalla de inicio del celular (PWA).
// Android pide íconos PNG de 192 y 512 px; el «maskable» deja margen para que el
// sistema lo recorte en círculo o en gota sin cortar el logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Cuadra · Compra conjunta',
    short_name: 'Cuadra',
    description: 'Compra conjunta entre tiendas de barrio',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f4ee',
    theme_color: '#0f3d2a',
    lang: 'es-CO',
    categories: ['business', 'shopping'],
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
