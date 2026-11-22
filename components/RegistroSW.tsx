'use client';

import { useEffect } from 'react';

/** Registra el service worker (página «Sin conexión» e instalación como app). Solo en producción. */
export function RegistroSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
