import type { MetadataRoute } from 'next';

// Manifiesto para instalar Cuadra como aplicación web progresiva desde el navegador
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cuadra · Compra conjunta',
    short_name: 'Cuadra',
    description: 'Compra conjunta entre tiendas de barrio',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f4ee',
    theme_color: '#0f3d2a',
    lang: 'es-CO',
    icons: [{ src: '/logo.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
