'use client';

import { useEffect, useRef } from 'react';

/**
 * Envoltura de <dialog> nativo abierto con showModal(): el navegador da foco contenido,
 * página inerte, Esc / gesto atrás y devuelve el foco al botón que lo abrió.
 */
export function Dialogo({
  abierto,
  onCerrar,
  tituloId,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  tituloId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const alCerrar = () => onCerrar();
    d.addEventListener('close', alCerrar);
    return () => d.removeEventListener('close', alCerrar);
  }, [onCerrar]);

  return (
    <dialog ref={ref} aria-labelledby={tituloId} {...({ closedby: 'any' } as object)}>
      {abierto && <div className="cuerpo">{children}</div>}
    </dialog>
  );
}
