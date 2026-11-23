'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { rpc, supabase } from '@/lib/supabase';
import { cop, fechaHora, relativo, cajas as nCajas, lugar, fechaHoraFin } from '@/lib/formato';
import { descuentoPara, explicarMeta, type Escalon, type ExplicacionMeta } from '@/lib/prorrateo';
import type { PedidoProveedor, ProductoVitrina, Vitrina } from '@/lib/tipos';
import { Logo } from '@/components/Logo';
import { Dialogo } from '@/components/Dialogo';
import { IconoCaja, IconoMas, IconoPedidos, IconoProveedores } from '@/components/Iconos';

// Vista de proveedor para la demostración: el mayorista de la demo ve la demanda que
// juntan las tiendas y publica ofertas por volumen. Sin clave; solo actúa sobre sus ofertas nuevas.

type Pestana = 'demanda' | 'ofertas';

const CLAVE_PROVEEDOR = 'cuadra.proveedor-demo';

/** Una frase con la regla que fija la meta mínima de cajas. */
function porQueMeta(x: ExplicacionMeta, precio: number): string {
  if (!x.meta) return 'Con estas escalas ningún pedido ahorra de verdad.';
  if (x.limita === 'valor')
    return `La fija el pedido mínimo de $1.500.000: con cajas de ${cop(precio)} hacen falta ${x.meta}.`;
  if (x.limita === 'descuento') return `La fija el primer escalón con al menos −5 %.`;
  return 'La fija el flete: con menos cajas no cabe en el ahorro.';
}

const ETIQUETA = { abierto: 'Juntando cajas', confirmado: 'Por despachar', entregado: 'Entregado', anulado: 'No se completó' } as const;

export default function VistaProveedor() {
  const [datos, setDatos] = useState<Vitrina | null>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('demanda');
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const avisar = (m: string) => {
    setMensaje(m);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensaje(''), 3500);
  };

  // Recuerda qué proveedor se estaba viendo en este celular
  useEffect(() => {
    try {
      setProveedorId(localStorage.getItem(CLAVE_PROVEEDOR));
    } catch {}
    setListo(true);
  }, []);

  const cambiarProveedor = (id: string) => {
    try {
      localStorage.setItem(CLAVE_PROVEEDOR, id);
    } catch {}
    setDatos(null);
    setProveedorId(id);
  };

  const cargar = useCallback(async () => {
    if (!listo) return;
    try {
      setDatos(await rpc<Vitrina>('vitrina_proveedor', proveedorId ? { p_proveedor_id: proveedorId } : {}));
      setError('');
    } catch (e) {
      const m = (e as Error).message;
      if (proveedorId && /No se encontró el proveedor/.test(m)) {
        // El proveedor guardado ya no existe (p. ej., tras reiniciar la demo): volver al de siempre
        try {
          localStorage.removeItem(CLAVE_PROVEEDOR);
        } catch {}
        setProveedorId(null);
        return;
      }
      setError(/fetch|network|Failed/i.test(m) ? 'No pudimos conectarnos. Revisa los datos o el wifi.' : m);
    }
  }, [listo, proveedorId]);

  useEffect(() => {
    cargar();
    const canal = supabase().channel('pedidos').on('broadcast', { event: 'cambio' }, () => cargar()).subscribe();
    const intervalo = setInterval(cargar, 20000);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      supabase().removeChannel(canal);
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  async function retirar(p: ProductoVitrina) {
    try {
      await rpc('vitrina_eliminar_oferta', { p_producto_id: p.id });
      avisar(`Retiraste ${p.nombre}: las tiendas ya no lo ven ni pueden abrir pedidos nuevos.`);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publicar(p: ProductoVitrina) {
    try {
      await rpc('vitrina_publicar_oferta', { p_producto_id: p.id });
      avisar(`${p.nombre} vuelve a estar en oferta.`);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pv = datos?.proveedor;
  const r = datos?.resumen;
  const activos = datos?.pedidos.filter((p) => p.estado === 'abierto' || p.estado === 'confirmado') ?? [];
  const cerrados = datos?.pedidos.filter((p) => p.estado === 'entregado' || p.estado === 'anulado') ?? [];

  return (
    <>
      <header className="barra">
        <span className="marca-logo">
          <Logo />
          <span>
            <span className="marca marca-larga">{pv?.nombre ?? 'Cuadra'}</span>
            <br />
            <span className="tienda">Vista de proveedor · demostración</span>
          </span>
        </span>
        <Link className="btn-salir enlace" href="/">
          Cambiar vista
        </Link>
      </header>

      <main className="app">
        {error && (
          <div className="aviso error fila" role="alert">
            <span>{error}</span>
            <button className="btn-texto" type="button" onClick={cargar}>Reintentar</button>
          </div>
        )}

        {datos && datos.proveedores.length > 1 && (
          <div className="campo selector-proveedor">
            <label htmlFor="sel-proveedor">Ver como</label>
            <select id="sel-proveedor" value={datos.proveedor.id} onChange={(e) => cambiarProveedor(e.target.value)}>
              {datos.proveedores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre} · {x.categoria}
                </option>
              ))}
            </select>
          </div>
        )}

        {!datos && !error && <p className="vacio" aria-busy="true">Cargando la demanda del barrio…</p>}

        {datos && pestana === 'demanda' && (
          <section>
            <h1 className="titulo-vista">Demanda de tus productos</h1>
            <p className="sub" style={{ marginBlockEnd: '0.85rem' }}>
              Las tiendas de cada barrio juntan sus cajas en un solo pedido. Tú recibes una orden consolidada, con una
              sola entrega, y nunca ves cuánto pidió cada tienda.
            </p>
            <div className="cifras-proveedor">
              <p><strong>{r!.por_despachar}</strong><span className="sub">órdenes por despachar</span></p>
              <p><strong>{r!.abiertos}</strong><span className="sub">pedidos juntando cajas ({r!.tiendas_en_curso} tiendas)</span></p>
              <p className="ancho"><strong>{cop(r!.ventas)}</strong><span className="sub">en ventas confirmadas · {nCajas(r!.cajas_vendidas)}</span></p>
              <p className="ancho"><strong>{cop(r!.comision)}</strong><span className="sub">comisión de Cuadra (3 %), solo sobre pedidos cerrados</span></p>
            </div>

            {activos.length === 0 && cerrados.length === 0 ? (
              <div className="estado-vacio">
                <IconoPedidos size={40} />
                <p>Todavía no hay pedidos de tus productos.</p>
              </div>
            ) : (
              <ul className="lista">
                {[...activos, ...cerrados].map((p) => <TarjetaDemanda key={p.id} p={p} />)}
              </ul>
            )}
          </section>
        )}

        {datos && pestana === 'ofertas' && (
          <section>
            <div className="encabezado-vista">
              <h1 className="titulo-vista">Mis ofertas</h1>
              {pv!.editable && (
                <button className="btn-abrir" type="button" onClick={() => setNueva(true)}>
                  <IconoMas size={20} />
                  Nueva oferta
                </button>
              )}
            </div>
            <p className="sub" style={{ marginBlockEnd: '0.85rem' }}>
              Cada oferta dice cuánto bajas el precio cuando el barrio junta más cajas. Las tiendas la ven en su
              pestaña Proveedores y pueden abrir un pedido conjunto con ella. Flete por entrega:{' '}
              {cop(pv!.flete_por_entrega)} · Entregas en {pv!.cobertura}.
            </p>
            {!pv!.editable && (
              <p className="aviso" style={{ marginBlockEnd: '0.85rem' }}>
                Este proveedor lo carga el equipo en /admin con su cotización verificada: aquí solo se puede ver.
              </p>
            )}
            <ul className="lista">
              {datos.productos.map((p) => (
                <li key={p.id}>
                  <article className="tarjeta" aria-labelledby={`of-${p.id}`}>
                    <header>
                      <div>
                        <h2 id={`of-${p.id}`}>{p.nombre}</h2>
                        <p className="sub">{p.empaque} · lista {cop(p.precio_lista_caja)}/caja</p>
                      </div>
                      {!p.activo ? (
                        <span className="etiqueta anulado">Retirada</span>
                      ) : (
                        p.origen === 'vitrina' && <span className="etiqueta abierto">Nueva</span>
                      )}
                    </header>
                    <ul className="escalones" aria-label={`Descuentos por volumen de ${p.nombre}`}>
                      {p.escalas.map((e) => <li key={e.cajas_min}>{e.cajas_min}+ cajas: −{e.descuento_pct}%</li>)}
                    </ul>
                    <p className="sub">
                      {p.objetivo_minimo
                        ? `Un pedido conjunto ahorra desde ${p.objetivo_minimo} cajas entre todas las tiendas. `
                        : ''}
                      {porQueMeta(explicarMeta(p.escalas, p.precio_lista_caja, pv!.flete_por_entrega), p.precio_lista_caja)}{' '}
                      {p.pedidos > 0 && `${p.pedidos} ${p.pedidos === 1 ? 'pedido' : 'pedidos'} de tiendas.`}
                    </p>
                    {!p.activo && (
                      <p className="sub">Las tiendas no la ven y no pueden abrir pedidos nuevos; los que ya estaban siguen su curso.</p>
                    )}
                    {pv!.editable && (
                      <div className="acciones">
                        {p.activo ? (
                          <button className="btn peligro compacto" type="button" onClick={() => retirar(p)}>
                            Retirar oferta
                          </button>
                        ) : (
                          <button className="btn secundario compacto" type="button" onClick={() => publicar(p)}>
                            Volver a publicar
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <nav className="nav-inferior dos" aria-label="Secciones">
        {(
          [
            ['demanda', 'Demanda', IconoPedidos, r?.por_despachar ?? 0],
            ['ofertas', 'Mis ofertas', IconoProveedores, 0],
          ] as const
        ).map(([v, texto, Icono, cuenta]) => (
          <button key={v} type="button" aria-current={pestana === v ? 'page' : undefined}
            onClick={() => { setPestana(v); window.scrollTo({ top: 0 }); }}>
            <span className="icono">
              <Icono />
              {cuenta > 0 && <span className="globo">{cuenta}</span>}
            </span>
            {texto}
          </button>
        ))}
      </nav>

      <div className="estado-vivo" role="status">{mensaje && <p>{mensaje}</p>}</div>

      {pv && (
        <DialogoOferta
          abierto={nueva}
          proveedorId={pv.id}
          flete={pv.flete_por_entrega}
          onCerrar={() => setNueva(false)}
          onPublicada={(nombre, meta) => {
            setNueva(false);
            avisar(`Oferta publicada: las tiendas ya ven ${nombre} (ahorra desde ${meta} cajas).`);
            cargar();
          }}
        />
      )}
    </>
  );
}

/** Un pedido conjunto visto por el proveedor: solo totales del barrio. */
function TarjetaDemanda({ p }: { p: PedidoProveedor }) {
  const faltan = Math.max(0, p.cajas_objetivo - p.total_cajas);
  const progresoId = `pp-${p.id}`;
  return (
    <li>
      <article className={`tarjeta ${p.estado}`} aria-labelledby={`d-${p.id}`}>
        <header>
          <div>
            <h2 id={`d-${p.id}`}>{p.producto}</h2>
            <p className="sub">{p.barrio} · entrega en {lugar(p.punto_acopio)}</p>
          </div>
          <span className={`etiqueta ${p.estado}`}>{ETIQUETA[p.estado]}</span>
        </header>

        <div className="avance">
          <div className="cifras">
            <span id={progresoId}><strong>{p.total_cajas}</strong> de {p.cajas_objetivo} cajas</span>
            <span>{p.tiendas} {p.tiendas === 1 ? 'tienda' : 'tiendas'}</span>
          </div>
          <progress className={faltan === 0 ? 'meta-lograda' : undefined} max={p.cajas_objetivo}
            value={Math.min(p.total_cajas, p.cajas_objetivo)} aria-labelledby={progresoId} />
          {p.estado === 'abierto' && (
            <p className="sub">
              {faltan > 0 ? `Le faltan ${nCajas(faltan)} al barrio para la meta.` : `Meta lograda: descuento actual −${p.descuento}%.`}{' '}
              Cierra {relativo(p.fecha_cierre)}.
            </p>
          )}
        </div>

        {(p.estado === 'confirmado' || p.estado === 'entregado') && (
          <div className="mia">
            <strong>Orden consolidada · una sola entrega</strong>
            <dl className="datos">
              <dt>{nCajas(p.total_cajas)} × {cop(p.precio_caja_final)} (−{p.descuento}%)</dt>
              <dd>{cop(p.valor_mercancia)}</dd>
              <dt>Flete de la entrega</dt>
              <dd>{cop(p.flete_total)}</dd>
              <dt className="total">Valor de la orden</dt>
              <dd className="total">{cop(p.valor_orden)}</dd>
              <dt>Comisión de Cuadra (3 %)</dt>
              <dd>−{cop(p.comision)}</dd>
            </dl>
            <span className="sub">
              {p.estado === 'entregado' && p.entregado_en
                ? `Entregado el ${fechaHoraFin(p.entregado_en)}`
                : `Una sola entrega en ${lugar(p.punto_acopio)}. ${p.retirados} de ${p.tiendas} tiendas ya recogieron.`}
            </span>
          </div>
        )}

        {p.estado === 'anulado' && (
          <div className="aviso">No llegó a la meta ({p.total_cajas} de {p.cajas_objetivo}): no hay orden ni cobro.</div>
        )}
      </article>
    </li>
  );
}

/** Formulario para publicar una oferta con precios por volumen. */
function DialogoOferta({
  abierto, proveedorId, flete, onCerrar, onPublicada,
}: {
  abierto: boolean;
  proveedorId: string;
  flete: number;
  onCerrar: () => void;
  onPublicada: (nombre: string, meta: number) => void;
}) {
  const id = useId();
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} tituloId={`${id}-t`}>
      <FormOferta key={proveedorId} tituloId={`${id}-t`} proveedorId={proveedorId} flete={flete} onCerrar={onCerrar} onPublicada={onPublicada} />
    </Dialogo>
  );
}

function FormOferta({
  tituloId, proveedorId, flete, onCerrar, onPublicada,
}: {
  tituloId: string;
  proveedorId: string;
  flete: number;
  onCerrar: () => void;
  onPublicada: (nombre: string, meta: number) => void;
}) {
  const [nombre, setNombre] = useState('Panela 500 g');
  const [empaque, setEmpaque] = useState('paca x 24 und.');
  const [precio, setPrecio] = useState(72000);
  const [escalas, setEscalas] = useState<Escalon[]>([
    { cajas_min: 15, descuento_pct: 5 },
    { cajas_min: 30, descuento_pct: 9 },
  ]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const ordenadas = [...escalas].sort((a, b) => a.cajas_min - b.cajas_min);
  const explicacion = precio > 0 ? explicarMeta(ordenadas, precio, flete) : null;
  const meta = explicacion?.meta ?? null;
  const dMeta = meta ? descuentoPara(ordenadas, meta) : 0;

  const cambiar = (i: number, campo: keyof Escalon, v: string) =>
    setEscalas((es) => es.map((e, j) => (j === i ? { ...e, [campo]: Number(v.replace(',', '.')) || 0 } : e)));

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await rpc<{ id: string; objetivo_minimo: number }>('vitrina_crear_oferta', {
        p_nombre: nombre, p_empaque: empaque, p_precio: precio, p_escalas: ordenadas, p_proveedor_id: proveedorId,
      });
      onPublicada(nombre.trim(), r.objetivo_minimo);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={publicar}>
      <h2 id={tituloId}>Nueva oferta por volumen</h2>
      <p className="sub">Precio de lista por caja y cuánto lo bajas cuando el barrio junta más cajas.</p>

      <div className="campo">
        <label htmlFor="of-nombre">Producto</label>
        <input id="of-nombre" required minLength={3} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="of-empaque">Empaque</label>
        <input id="of-empaque" required minLength={3} maxLength={40} value={empaque} onChange={(e) => setEmpaque(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="of-precio">Precio de lista por caja (COP)</label>
        <input id="of-precio" inputMode="numeric" required value={precio || ''} aria-describedby="of-precio-ayuda"
          onChange={(e) => setPrecio(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        <span id="of-precio-ayuda" className="ayuda">
          {precio > 0 && precio < 15000
            ? `¿Seguro que es la caja completa? ${cop(precio)} parece el precio de una unidad, y con eso la meta sube mucho.`
            : 'El precio de la caja o paca completa, no el de una unidad.'}
        </span>
      </div>

      <fieldset>
        <legend>Escalones de descuento</legend>
        <div className="escalones-form">
          {escalas.map((e, i) => (
            <div key={i} className="escalon-fila">
              <label>
                <span className="sub">Desde</span>
                <input inputMode="numeric" aria-label={`Cajas del escalón ${i + 1}`} value={e.cajas_min || ''}
                  onChange={(ev) => cambiar(i, 'cajas_min', ev.target.value.replace(/\D/g, ''))} />
                <span className="sub">cajas</span>
              </label>
              <label>
                <span className="sub">−</span>
                <input inputMode="decimal" aria-label={`Descuento del escalón ${i + 1} en porcentaje`} value={e.descuento_pct || ''}
                  onChange={(ev) => cambiar(i, 'descuento_pct', ev.target.value)} />
                <span className="sub">%</span>
              </label>
              {escalas.length > 1 && (
                <button type="button" className="btn-texto" aria-label={`Quitar escalón ${i + 1}`}
                  onClick={() => setEscalas((es) => es.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
        {escalas.length < 4 && (
          <button type="button" className="btn-texto" onClick={() =>
            setEscalas((es) => [...es, { cajas_min: (es.at(-1)?.cajas_min ?? 10) + 15, descuento_pct: (es.at(-1)?.descuento_pct ?? 5) + 3 }])}>
            + Agregar escalón
          </button>
        )}
      </fieldset>

      <div className={meta ? 'aviso exito' : 'aviso'} aria-live="polite">
        <p>
          {meta
            ? `Con estas escalas, un pedido conjunto ahorra desde ${meta} cajas (−${dMeta}%, ${cop(Math.round(meta * precio * (1 - dMeta / 100)))}).`
            : 'Con estas escalas ningún pedido ahorra de verdad.'}
        </p>
        {explicacion && (
          <ul className="reglas-meta">
            <li className={explicacion.limita === 'descuento' ? 'fija' : undefined}>
              Descuento de al menos 5 %: {explicacion.porDescuento ? `desde ${explicacion.porDescuento} cajas` : 'ningún escalón llega'}
            </li>
            <li className={explicacion.limita === 'valor' ? 'fija' : undefined}>
              Pedido de $1.500.000 o más: {explicacion.porValor ? `desde ${explicacion.porValor} cajas` : 'más de 1.000 cajas'}
            </li>
            <li className={explicacion.limita === 'flete' ? 'fija' : undefined}>
              Flete de {cop(flete)} cubierto por el ahorro: {explicacion.porFlete ? `desde ${explicacion.porFlete} cajas` : 'no alcanza'}
            </li>
          </ul>
        )}
      </div>

      {error && <p className="aviso error" role="alert" style={{ marginBlockStart: '0.75rem' }}>{error}</p>}

      <div className="pie">
        <button className="btn secundario" type="button" onClick={onCerrar}>Cancelar</button>
        <button className="btn" type="submit" disabled={enviando || !meta}>
          <IconoCaja size={20} />
          {enviando ? 'Publicando…' : 'Publicar oferta'}
        </button>
      </div>
    </form>
  );
}
