import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cuadra · Compra conjunta entre tiendas de barrio',
  description:
    'Prototipo académico: tiendas vecinas suman sus pedidos para alcanzar el volumen mínimo del mayorista y comprar a precio de escala.',
  applicationName: 'Cuadra',
};

export const viewport: Viewport = {
  themeColor: '#0f3d2a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
