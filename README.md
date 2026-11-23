# Cuadra · Compra conjunta entre tiendas de barrio

Prototipo funcional (prueba de concepto) para la asignatura **Gestión de Tecnología e Innovación**, Universidad El Bosque, 2026-2.

Tiendas vecinas abren o se suman a un **pedido conjunto** de un producto; si antes de la fecha de cierre juntan el volumen objetivo, el pedido se confirma al precio por escala del mayorista y el flete se reparte entre ellas. Si no se llega a la meta, **nadie paga**.

> ⚠️ Todo es simulado: tiendas, proveedor, precios y pagos son ficticios. El prototipo no mueve dinero real ni envía mensajes de WhatsApp.

## Probarlo

1. Abre la URL del despliegue.
2. Elige una tienda de **Timiza** y entra con el PIN **1234**.
3. En *Abiertos* verás los pedidos a menos de 1,5 km. Toca **Sumarme al pedido**, elige cajas y reserva.
4. Entra con otra tienda (otra pestaña o el celular) y mira cómo la barra de avance se actualiza sola.
5. Con la tienda anfitriona (p. ej. *Tienda Doña Rosa* para el arroz) usa **Cerrar ahora (demo)** para ver la liquidación en *Historial*. Abre **¿Cómo se calculó mi cobro?** para ver el paso a paso y el sello «Cuadra al peso».
6. Con *Autoservicio El Vecino* (anfitriona de la gaseosa, ya confirmada) abre **Lista de entrega** y marca a cada tienda cuando recoge: al marcarlas todas, el pedido pasa a **Entregado**.
7. Las tiendas de **Suba** no ven los pedidos de Timiza (filtro por zona).

**Para entrevistas:** en `/facilitador` hay un botón que reinicia la demo (arroz en 18 de 30 cajas) con la clave del entrevistador, para que cada participante empiece igual. La clave no está en el repositorio.

**Proveedores:** las tiendas ven en la pestaña *Proveedores* los proveedores verificados, sus productos y sus descuentos por volumen, y pueden abrir un pedido desde ahí. Los proveedores no se registran solos: el equipo los da de alta en `/admin` (misma clave del entrevistador) después de verificar la cotización escrita. Las categorías se administran ahí mismo y la cobertura se elige por localidad y barrio de Bogotá (`lib/bogota.ts`, generado del listado de barrios por UPZ de la Secretaría Distrital de Planeación). La base rechaza escalas con las que ningún pedido ahorraría lo mínimo. Lo que se carga en `/admin` se conserva al reiniciar la demo.

## Qué incluye (alcance)

| Incluido | Fuera de alcance |
|---|---|
| Ciclo completo: abierto → confirmado → entregado (o anulado) |  |
| Abrir un pedido conjunto con meta, ventana de cierre y punto de entrega | Pago real (PSE/Nequi): se simula retener, liberar y devolver |
| Sumarse, cambiar cajas o retirarse, con avance en tiempo real | Notificaciones reales por WhatsApp |
| Precio escalonado del mayorista y regla de ahorro neto mínimo | Logística y ruteo de la entrega |
| Cierre todo-o-nada y reparto del flete (método del mayor residuo) | Registro abierto de tiendas y verificación de identidad |
| Filtro geográfico (Haversine, radio 1,5 km) | Panel del proveedor |
| Registro auditable de cada acción | |
| Lista de entrega para la anfitriona y explicación del cobro paso a paso | |
| Control de retención: ningún cobro supera lo retenido al reservar | |
| App instalable (PWA) con página «Sin conexión» | |

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
- **Control de retención**: al reservar se retiene cajas × precio de lista. Al abrir se exige que el flete quepa en el ahorro de la meta (con un peso de margen por redondeo); como el descuento solo sube y el flete por caja solo baja con más volumen, ningún cobro final puede superar lo retenido. Si por cualquier motivo pasara, `interno.cerrar()` anula el pedido y devuelve todo.
- **Entrega**: `lista_entrega` es la única función que devuelve cajas por tienda, y solo a la anfitriona de un pedido confirmado (quien entrega necesita saberlo). Cuando marca a todas, el pedido queda `entregado`.

## Estructura

```
app/                 páginas Next.js (App Router)
components/          tarjetas y diálogos
lib/                 cliente Supabase, formato, prorrateo (estimaciones)
supabase/migrations/ esquema, lógica, datos demo
scripts/             base local para desarrollar o demostrar sin internet
tests/               pruebas del prorrateo y de la lógica en Postgres
```

## Ejecutar en local

```bash
npm install
cp .env.example .env.local   # pon la URL y la llave publicable de tu proyecto Supabase
npm run dev                  # http://localhost:3000
npm test                     # 11 pruebas: prorrateo, 10.000 escenarios y lógica en Postgres
```

### Sin Supabase ni internet

```bash
npm run dev:local            # (Windows, Mac o Linux; Node 22.18+) base en memoria con las migraciones reales + app en http://localhost:3000
```

Corre las migraciones sobre Postgres en memoria (PGlite) con los datos demo. La clave de `/facilitador` en local es `local`. Sirve de respaldo para la sustentación si falla la conexión.

### Actualizar la base de producción

Ejecuta en el editor SQL de Supabase, **en este orden y antes de publicar la app nueva**: `006_estado_entregado.sql` y luego `007_entrega_y_retencion.sql`. Son compatibles con la versión anterior de la app.

Para montar la base en otro proyecto Supabase, ejecuta en orden los archivos de `supabase/migrations/` en el editor SQL.

## Seguridad y límites conocidos del prototipo

- El ingreso es por tienda + PIN de 4 dígitos con sesiones de 12 horas; suficiente para la demostración, no para producción (faltaría límite de intentos y verificación de identidad).
- Solo la llave publicable va al navegador; no hay llaves secretas en el repositorio.
- Mostrar el total del pedido permite deducir las cajas de una vecina cuando solo hay dos participantes; es una limitación aceptada del diseño.
