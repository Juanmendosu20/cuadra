'use client';

import { useId, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { cop } from '@/lib/formato';
import type { Proveedor } from '@/lib/tipos';
import { Logo } from '@/components/Logo';

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type FilaEscala = { cajas: string; desc: string };

// Panel del equipo: da de alta proveedores verificados y sus productos con escalas por volumen.
// La clave es la misma del modo entrevistador; nunca se guarda en el navegador.
export default function Admin() {
  const id = useId();
  const [clave, setClave] = useState('');
  const [provs, setProvs] = useState<Proveedor[] | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar(c = clave) {
    setProvs(await rpc<Proveedor[]>('admin_listar_proveedores', { p_clave: c }));
  }

  async function ejecutar(fn: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    setAviso(null);
    try {
      await fn();
      if (ok) setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const c = String(new FormData(e.currentTarget).get('clave') ?? '');
    if (await ejecutar(() => cargar(c))) setClave(c);
  }

  if (!provs) {
    return (
      <main className="portada">
        <div className="hero">
          <span className="marca-logo">
            <Logo size={40} />
            <h1>Administrar proveedores</h1>
          </span>
          <p>Solo para el equipo de Cuadra. Cada proveedor se publica después de verificar su cotización escrita.</p>
        </div>
        <form className="panel" onSubmit={entrar}>
          <div className="campo">
            <label htmlFor={`${id}-clave`}>Clave de administración</label>
            <input id={`${id}-clave`} name="clave" type="password" required autoComplete="off" enterKeyHint="go" />
          </div>
          <div role="status">{aviso && <p className={`aviso ${aviso.tipo === 'error' ? 'error' : ''}`}>{aviso.texto}</p>}</div>
          <button className="btn bloque" type="submit" disabled={ocupado}>
            {ocupado ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="pie-nota">
          <a href="/">Volver a la app</a>
        </p>
      </main>
    );
  }

  return (
    <main className="portada admin">
      <div className="hero">
        <span className="marca-logo">
          <Logo size={40} />
          <h1>Administrar proveedores</h1>
        </span>
        <p>
          Lo que publiques aquí aparece al instante en la pestaña <strong>Proveedores</strong> de todas las tiendas y
          se conserva al reiniciar la demo. Usa nombres de ejemplo mientras no haya un convenio firmado.
        </p>
      </div>

      <div className="estado-vivo" role="status">
        {aviso && <p className={`aviso ${aviso.tipo === 'error' ? 'error' : ''}`}>{aviso.texto}</p>}
      </div>

      <FormProveedor
        ocupado={ocupado}
        onCrear={(d) =>
          ejecutar(async () => {
            await rpc('admin_crear_proveedor', { p_clave: clave, ...d });
            await cargar();
          }, `Proveedor «${d.p_nombre}» creado. Ahora agrégale productos.`)
        }
      />

      <h2 className="titulo-vista" style={{ marginBlockStart: '1.5rem' }}>
        Proveedores publicados ({provs.length})
      </h2>
      <ul className="lista">
        {provs.map((pv) => (
          <li key={pv.id} className="tarjeta">
            <header>
              <div>
                <h3>{pv.nombre}</h3>
                <p className="sub">
                  {pv.categoria} · {pv.cobertura} · flete {cop(pv.flete_por_entrega)}
                  {pv.origen === 'demo' && ' · de la demo'}
                </p>
              </div>
              {pv.productos.length === 0 && (
                <button
                  className="btn compacto peligro"
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    ejecutar(async () => {
                      await rpc('admin_eliminar_proveedor', { p_clave: clave, p_proveedor_id: pv.id });
                      await cargar();
                    }, `Proveedor «${pv.nombre}» eliminado.`)
                  }
                >
                  Eliminar
                </button>
              )}
            </header>

            <ul className="productos-proveedor">
              {pv.productos.map((p) => (
                <li key={p.id}>
                  <div className="fila-producto">
                    <span>
                      <strong>{p.nombre}</strong>
                      <span className="sub">
                        {' '}
                        · {p.empaque} · {cop(p.precio_lista_caja)} · meta mínima {p.objetivo_minimo ?? '—'} cajas
                      </span>
                    </span>
                    {p.pedidos === 0 && (
                      <button
                        className="btn compacto peligro"
                        type="button"
                        disabled={ocupado}
                        aria-label={`Eliminar ${p.nombre}`}
                        onClick={() =>
                          ejecutar(async () => {
                            await rpc('admin_eliminar_producto', { p_clave: clave, p_producto_id: p.id });
                            await cargar();
                          }, `Producto «${p.nombre}» eliminado.`)
                        }
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <ul className="escalones">
                    {p.escalas.map((e) => (
                      <li key={e.cajas_min}>
                        {e.cajas_min}+ cajas: −{e.descuento_pct}%
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <FormProducto
              ocupado={ocupado}
              onCrear={(d) =>
                ejecutar(async () => {
                  const r = await rpc<{ objetivo_minimo: number }>('admin_crear_producto', {
                    p_clave: clave,
                    p_proveedor_id: pv.id,
                    ...d,
                  });
                  await cargar();
                  setAviso({
                    tipo: 'ok',
                    texto: `Producto «${d.p_nombre}» publicado. Un pedido conjunto ahorra desde ${r.objetivo_minimo} cajas.`,
                  });
                })
              }
            />
          </li>
        ))}
      </ul>

      <p className="pie-nota">
        <a href="/">Volver a la app</a>
      </p>
    </main>
  );
}

function FormProveedor({
  ocupado,
  onCrear,
}: {
  ocupado: boolean;
  onCrear: (d: { p_nombre: string; p_categoria: string; p_cobertura: string; p_flete: number }) => Promise<boolean>;
}) {
  const id = useId();
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    const ok = await onCrear({
      p_nombre: String(d.get('nombre')),
      p_categoria: String(d.get('categoria')),
      p_cobertura: String(d.get('cobertura')),
      p_flete: Number(d.get('flete')),
    });
    if (ok) f.reset();
  }
  return (
    <form className="panel" onSubmit={enviar}>
      <h2 className="titulo-vista">Nuevo proveedor</h2>
      <div className="campo">
        <label htmlFor={`${id}-n`}>Nombre</label>
        <span className="ayuda" id={`${id}-nh`}>Ej. «Distribuidora Zonal Kennedy (ejemplo)»</span>
        <input id={`${id}-n`} name="nombre" required minLength={3} maxLength={80} autoComplete="off" aria-describedby={`${id}-nh`} />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-c`}>Categoría</label>
        <input id={`${id}-c`} name="categoria" required maxLength={40} list={`${id}-cats`} autoComplete="off" />
        <datalist id={`${id}-cats`}>
          {['Abarrotes', 'Granos', 'Aseo', 'Lácteos', 'Bebidas', 'Panadería'].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-z`}>Cobertura (barrios o localidades)</label>
        <input id={`${id}-z`} name="cobertura" required maxLength={80} autoComplete="off" />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-f`}>Flete por entrega (pesos)</label>
        <span className="ayuda" id={`${id}-fh`}>Se reparte entre las tiendas del pedido según sus cajas.</span>
        <input id={`${id}-f`} name="flete" type="number" inputMode="numeric" required min={0} max={1000000} step={1000} aria-describedby={`${id}-fh`} />
      </div>
      <button className="btn bloque" type="submit" disabled={ocupado}>
        Crear proveedor
      </button>
    </form>
  );
}

function FormProducto({
  ocupado,
  onCrear,
}: {
  ocupado: boolean;
  onCrear: (d: {
    p_nombre: string;
    p_empaque: string;
    p_precio: number;
    p_escalas: { cajas_min: number; descuento_pct: number }[];
  }) => Promise<boolean>;
}) {
  const id = useId();
  const [filas, setFilas] = useState<FilaEscala[]>([{ cajas: '', desc: '' }]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    const ok = await onCrear({
      p_nombre: String(d.get('nombre')),
      p_empaque: String(d.get('empaque')),
      p_precio: Number(d.get('precio')),
      p_escalas: filas.map((r) => ({ cajas_min: Number(r.cajas), descuento_pct: Number(r.desc) })),
    });
    if (ok) {
      f.reset();
      setFilas([{ cajas: '', desc: '' }]);
    }
  }

  const cambiar = (i: number, k: keyof FilaEscala, v: string) =>
    setFilas((fs) => fs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <details className="nuevo-producto">
      <summary>Agregar producto</summary>
      <form onSubmit={enviar}>
        <div className="campo">
          <label htmlFor={`${id}-n`}>Producto</label>
          <input id={`${id}-n`} name="nombre" required minLength={3} maxLength={80} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-e`}>Empaque</label>
          <span className="ayuda" id={`${id}-eh`}>Ej. «caja x 24 und.»</span>
          <input id={`${id}-e`} name="empaque" required minLength={3} maxLength={40} autoComplete="off" aria-describedby={`${id}-eh`} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-p`}>Precio de lista por caja (pesos)</label>
          <input id={`${id}-p`} name="precio" type="number" inputMode="numeric" required min={1000} max={5000000} step={100} />
        </div>
        <fieldset className="campo escalas-form">
          <legend>Descuentos por volumen (de la cotización)</legend>
          <span className="ayuda">Desde cuántas cajas aplica cada descuento. El descuento debe subir con el volumen.</span>
          {filas.map((r, i) => (
            <div className="fila-escala" key={i}>
              <label>
                <span>Desde (cajas)</span>
                <input type="number" inputMode="numeric" required min={2} max={1000} value={r.cajas} onChange={(e) => cambiar(i, 'cajas', e.target.value)} />
              </label>
              <label>
                <span>Descuento (%)</span>
                <input type="number" inputMode="decimal" required min={0.5} max={60} step={0.5} value={r.desc} onChange={(e) => cambiar(i, 'desc', e.target.value)} />
              </label>
              {filas.length > 1 && (
                <button className="btn-texto" type="button" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} aria-label={`Quitar escala ${i + 1}`}>
                  Quitar
                </button>
              )}
            </div>
          ))}
          {filas.length < 6 && (
            <button className="btn-texto" type="button" onClick={() => setFilas((fs) => [...fs, { cajas: '', desc: '' }])}>
              + Otra escala
            </button>
          )}
        </fieldset>
        <button className="btn bloque" type="submit" disabled={ocupado}>
          Publicar producto
        </button>
      </form>
    </details>
  );
}
