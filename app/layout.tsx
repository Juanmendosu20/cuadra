import type { Metadata, Viewport } from 'next';
import { RegistroSW } from '@/components/RegistroSW';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cuadra · Compra conjunta entre tiendas de barrio',
  description:
    'Prototipo académico: tiendas vecinas suman sus pedidos para alcanzar el volumen mínimo del mayorista y comprar a precio de escala.',
  applicationName: 'Cuadra',
  appleWebApp: { capable: true, title: 'Cuadra', statusBarStyle: 'black-translucent' },
  icons: { apple: '/iconos/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f3d2a',
  width: 'device-width',
  initialScale: 1,
  // Ocupa toda la pantalla en celulares con muesca; los márgenes seguros se respetan en el CSS
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        {children}
        <RegistroSW />
      </body>
    </html>
  );
}
