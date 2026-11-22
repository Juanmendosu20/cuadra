export type Escalon = { cajas_min: number; descuento_pct: number };

export type MiParticipacion = {
  cajas: number;
  estado_pago: 'reservado' | 'liberado' | 'devuelto';
  monto_reservado: number;
  valor_mercancia: number | null;
  flete_asignado: number | null;
  monto_final: number | null;
  costo_comprando_solo: number;
  ahorro: number | null;
};

export type Pedido = {
  id: string;
  estado: 'abierto' | 'confirmado' | 'anulado';
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
  flete_total: number;
  total_cajas: number;
  participantes: number;
  descuento_actual: number;
  precio_caja_final: number | null;
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
