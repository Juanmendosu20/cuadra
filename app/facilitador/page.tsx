'use client';

import { useId, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

// Página para quien hace las entrevistas: deja la demo como recién sembrada
// (arroz en 18 de 30 cajas) antes de cada participante.
export default function Facilitador() {
  const id = useId();
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function reiniciar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const clave = String(new FormData(e.currentTarget).get('clave') ?? '');
    setEnviando(true);
    setEstado(null);
    try {
      await rpc('reiniciar_demo', { p_clave: clave });
      try {
        localStorage.removeItem('cuadra.sesion');
      } catch {}
      const hora = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date());
      setEstado({ tipo: 'ok', texto: `Demo reiniciada (${hora}). El arroz está en 18 de 30 cajas: ya puede pasar el siguiente participante.` });
    } catch (err) {
      setEstado({ tipo: 'error', texto: (err as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="portada">
      <div className="hero">
        <span className="marca-logo">
          <Logo size={40} />
          <h1>Modo entrevistador</h1>
        </span>
        <p>Usa esto antes de cada participante. Borra todo lo que se hizo en la demo y la deja en el punto de partida.</p>
      </div>

      <form className="panel" onSubmit={reiniciar}>
        <div className="campo">
          <label htmlFor={`${id}-clave`}>Clave del entrevistador</label>
          <input id={`${id}-clave`} name="clave" type="password" required autoComplete="off" enterKeyHint="go" />
        </div>
        <div role="status">
          {estado && <p className={estado.tipo === 'error' ? 'aviso error' : 'aviso'} style={{ marginBlockEnd: '1rem' }}>{estado.texto}</p>}
        </div>
        <button className="btn bloque" type="submit" disabled={enviando}>
          {enviando ? 'Reiniciando…' : 'Reiniciar la demo'}
        </button>
      </form>

      <p className="pie-nota">
        <a href="/">Volver a la app</a>
      </p>
    </main>
  );
}
