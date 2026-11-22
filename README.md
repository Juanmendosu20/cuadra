# Cuadra · Compra conjunta entre tiendas de barrio

Prototipo funcional (prueba de concepto) para la asignatura **Gestión de Tecnología e Innovación**, Universidad El Bosque, 2026-2.

Tiendas vecinas abren o se suman a un **pedido conjunto** de un producto; si antes de la fecha de cierre juntan el volumen objetivo, el pedido se confirma al precio por escala del mayorista y el flete se reparte entre ellas. Si no se llega a la meta, **nadie paga**.

> ⚠️ Todo es simulado: tiendas, proveedor, precios y pagos son ficticios. El prototipo no mueve dinero real ni envía mensajes de WhatsApp.

## Probarlo

1. Abre la URL del despliegue.
2. Elige una tienda de **Timiza** y entra con el PIN **1234**.
3. En *Abiertos* verás los pedidos a menos de 1,5 km. Toca **Sumarme al pedido**, elige cajas y reserva.
4. Entra con otra tienda (otra pestaña o el celular) y mira cómo la barra de avance se actualiza sola.
5. Con la tienda anfitriona (p. ej. *Tienda Doña Rosa* para el arroz) usa **Cerrar ahora (demo)** para ver la liquidación en *Historial*.
6. Las tiendas de **Suba** no ven los pedidos de Timiza (filtro por zona).

## Qué incluye (alcance)

| Incluido | Fuera de alcance |
|---|---|
| Abrir un pedido conjunto con meta, ventana de cierre y punto de entrega | Pago real (PSE/Nequi): se simula retener, liberar y devolver |
| Sumarse, cambiar cajas o retirarse, con avance en tiempo real | Notificaciones reales por WhatsApp |
| Precio escalonado del mayorista y regla de ahorro neto mínimo | Logística y ruteo de la entrega |
| Cierre todo-o-nada y reparto del flete (método del mayor residuo) | Registro abierto de tiendas y verificación de identidad |
| Filtro geográfico (Haversine, radio 1,5 km) | Panel del proveedor |
| Registro auditable de cada acción | |

## Arquitectura

```
Navegador (Next.js en Vercel, PWA)
   │  supabase-js · llave publicable
   ▼
Supabase
   ├─ PostgREST → funciones RPC (SECURITY DEFINER) ← única puerta de entrada
   ├─ Postgres: tablas con RLS y sin permisos para el cliente
   └─ Realtime: aviso "pedido X cambió" (sin datos de otras tiendas)
```

- **Las tablas están cerradas al cliente** (RLS activado sin políticas + `REVOKE`). El cliente solo puede llamar funciones como `listar_pedidos`, `sumarse` o `abrir_pedido`, que validan la sesión y devuelven **agregados**: una tienda nunca ve las cajas de sus vecinas.
- **Concurrencia**: `sumarse` bloquea la fila del pedido (`SELECT … FOR UPDATE`), así varias tiendas que se suman al tiempo no pueden pasar del cupo máximo ni duplicar participaciones (`UNIQUE (pedido_id, tienda_id)`).
- **Cierre**: `interno.cerrar()` aplica la regla todo-o-nada, calcula el descuento por el volumen final y reparte el flete en pesos enteros con el método del mayor residuo (la suma es exacta).
- **Regla de ahorro neto** (Entrega 1, §9.4): no se puede abrir un pedido cuya meta no dé al menos −5% y $1.500.000.

## Estructura

```
app/                 páginas Next.js (App Router)
components/          tarjetas y diálogos
lib/                 cliente Supabase, formato, prorrateo (estimaciones)
supabase/migrations/ esquema, lógica, datos demo
tests/               pruebas del prorrateo
```

## Ejecutar en local

```bash
npm install
cp .env.example .env.local   # pon la URL y la llave publicable de tu proyecto Supabase
npm run dev                  # http://localhost:3000
npm test                     # pruebas del prorrateo
```

Para montar la base en otro proyecto Supabase, ejecuta en orden los archivos de `supabase/migrations/` en el editor SQL.

## Seguridad y límites conocidos del prototipo

- El ingreso es por tienda + PIN de 4 dígitos con sesiones de 12 horas; suficiente para la demostración, no para producción (faltaría límite de intentos y verificación de identidad).
- Solo la llave publicable va al navegador; no hay llaves secretas en el repositorio.
- Mostrar el total del pedido permite deducir las cajas de una vecina cuando solo hay dos participantes; es una limitación aceptada del diseño.
