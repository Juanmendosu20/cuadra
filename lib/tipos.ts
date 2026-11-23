export type Escalon = { cajas_min: number; descuento_pct: number };

export type MiParticipacion = {
  cajas: number;
  estado_pago: 'reservado' | 'liberado' | 'devuelto';
  monto_reservado: number;
  valor_mercancia: number | null;
  flete_asignado: number | null;
  monto_final: number | null;
  retirado_en: string | null;
  costo_comprando_solo: number;
  ahorro: number | null;
};

export type EstadoPedido = 'abierto' | 'confirmado' | 'entregado' | 'anulado';

export type Pedido = {
  id: string;
  estado: EstadoPedido;
  producto: string;
  producto_id: string;
  empaque: string;
  proveedor: string;
  precio_lista_caja: number;
  punto_acopio: string;
  anfitrion: string;
  soy_anfitrion: boolean;
  distancia_km: number;
  cajas_objetivo: number;
  cajas_maximas: number;
  fecha_cierre: string;
  cerrado_en: string | null;
  entregado_en: string | null;
  flete_total: number;
  total_cajas: number;
  participantes: number;
  /** Tiendas que ya recogieron sus cajas en el punto de acopio */
  retirados: number;
  descuento_actual: number;
  precio_caja_final: number | null;
  /** Cajas totales × precio final + flete (solo cuando ya cerró confirmado) */
  valor_orden: number | null;
  /** Suma de lo cobrado a todas las tiendas: debe ser igual a valor_orden */
  suma_cobros: number | null;
  siguiente_escalon: Escalon | null;
  escalas: Escalon[];
  mi_participacion: MiParticipacion | null;
};

export type Producto = {
  id: string;
  nombre: string;
  empaque: string;
  proveedor: string;
  precio_lista_caja: number;
  objetivo_minimo: number;
  escalas: Escalon[];
};

export type Tienda = { id: string; nombre: string; barrio: string };

export type Sesion = { token: string; tienda: Tienda };

export type Movimiento = {
  accion: string;
  detalle: Record<string, unknown>;
  creado: string;
  producto: string | null;
};

/** Fila de la lista de entrega (solo la ve la tienda anfitriona). */
export type ItemEntrega = {
  participacion_id: string;
  tienda: string;
  es_mia: boolean;
  cajas: number;
  retirado_en: string | null;
};

export type ProductoProveedor = {
  id: string;
  nombre: string;
  empaque: string;
  precio_lista_caja: number;
  objetivo_minimo: number | null;
  pedidos: number;
  escalas: Escalon[];
};

/** Proveedor verificado por el equipo (lo carga el administrador en /admin). */
export type Proveedor = {
  id: string;
  nombre: string;
  categoria: string;
  cobertura: string;
  flete_por_entrega: number;
  origen: 'demo' | 'admin';
  productos: ProductoProveedor[];
};

/** Vista de proveedor de la demostración (vitrina_proveedor). */
export type PedidoProveedor = {
  id: string;
  estado: EstadoPedido;
  producto: string;
  empaque: string;
  precio_lista_caja: number;
  cajas_objetivo: number;
  fecha_cierre: string;
  cerrado_en: string | null;
  entregado_en: string | null;
  punto_acopio: string;
  anfitriona: string;
  barrio: string;
  flete_total: number;
  precio_caja_final: number | null;
  descuento: number;
  total_cajas: number;
  tiendas: number;
  retirados: number;
  valor_mercancia: number | null;
  valor_orden: number | null;
  comision: number | null;
};

export type ProductoVitrina = ProductoProveedor & { origen: 'base' | 'vitrina' };

export type Vitrina = {
  proveedor: { id: string; nombre: string; categoria: string; cobertura: string; flete_por_entrega: number };
  productos: ProductoVitrina[];
  pedidos: PedidoProveedor[];
  resumen: {
    abiertos: number;
    por_despachar: number;
    entregados: number;
    cajas_vendidas: number;
    ventas: number;
    comision: number;
    tiendas_en_curso: number;
  };
};
