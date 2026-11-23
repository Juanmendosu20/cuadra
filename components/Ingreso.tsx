'use client';

import { useEffect, useId, useState } from 'react';
import { rpc } from '@/lib/supabase';
import type { Sesion, Tienda } from '@/lib/tipos';
import { Logo } from './Logo';

export function Ingreso({ onEntrar }: { onEntrar: (s: Sesion) => void }) {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const id = useId();

  useEffect(() => {
    rpc<Tienda[]>('listar_tiendas')
      .then(setTiendas)
      .catch(() => setError('No se pudo cargar la lista de tiendas. Revisa tu conexión.'));
  }, []);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setEnviando(true);
    setError('');
    try {
      const s = await rpc<Sesion>('iniciar_sesion', {
        p_tienda_id: datos.get('tienda'),
        p_pin: datos.get('pin'),
      });
      onEntrar(s);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  const barrios = [...new Set(tiendas.map((t) => t.barrio))];

  return (
    <main className="portada">
      <div className="hero">
        <span className="marca-logo">
          <Logo size={44} />
          <h1>Cuadra</h1>
        </span>
        <p>
          Súmate con las tiendas de tu cuadra, completen juntas el pedido mínimo del mayorista y
          compren a precio de escala. Si no se llega a la meta, nadie paga.
        </p>
      </div>

      <form className="panel" onSubmit={entrar} aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`} className="visually-hidden">Entrar a mi tienda</h2>
        <div className="campo">
          <label htmlFor={`${id}-tienda`}>Mi tienda</label>
          <select id={`${id}-tienda`} name="tienda" required defaultValue="">
            <option value="" disabled>
              {tiendas.length ? 'Elige tu tienda' : 'Cargando…'}
            </option>
            {barrios.map((b) => (
              <optgroup key={b} label={b}>
                {tiendas
                  .filter((t) => t.barrio === b)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-pin`}>PIN</label>
          <input
            id={`${id}-pin`}
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            pattern="\d{4}"
            maxLength={4}
            aria-describedby={`${id}-pin-ayuda`}
            enterKeyHint="go"
          />
          <span id={`${id}-pin-ayuda`} className="ayuda">
            4 dígitos. Todas las tiendas usan <strong>1234</strong>.
          </span>
        </div>
        {error && (
          <p className="aviso error" role="alert">
            {error}
          </p>
        )}
        <button className="btn bloque" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="pie-nota">
        Prototipo académico · Universidad El Bosque · Gestión de Tecnología e Innovación 2026-2.
        Tiendas, precios y pagos son simulados.
      </p>
    </main>
  );
}
