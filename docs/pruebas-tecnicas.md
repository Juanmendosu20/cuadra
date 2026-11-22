# Pruebas técnicas del prototipo (evidencia para el informe)

Fecha de ejecución: 22 de noviembre de 2026 · Entorno: despliegue en Vercel + proyecto Supabase `cuadra` (us-east-1) con los datos demo.

Estas pruebas son la evidencia técnica de la validación (enunciado §3.3: "benchmark o experimento técnico"). No sustituyen la prueba con tenderos.

## 1. Concurrencia: varias tiendas sumándose al mismo tiempo

**Hipótesis técnica:** con solicitudes simultáneas cerca del cupo, el pedido nunca supera su máximo ni duplica la participación de una tienda.

**Método:** desde el navegador se dispararon **12 solicitudes `sumarse` en paralelo** (`Promise.all`) sobre el pedido demo de aceite (cupo máximo 40 cajas, tenía 10):
- 7 tiendas distintas pidiendo 8 cajas cada una (demanda total 10 + 56 = 66 cajas, muy por encima del cupo).
- La misma tienda (Carmencita) repitiendo 5 veces una reserva de 2 cajas, al mismo tiempo que su reserva de 8.

**Resultado:**

| Medida | Valor |
|---|---|
| Solicitudes enviadas | 12 |
| Aceptadas | 9 |
| Rechazadas | 3 (“Solo quedan 4 cajas disponibles en este pedido.”) |
| Cajas antes → después | 10 → 36 (máximo 40) ✅ |
| Participaciones de Carmencita | 1 sola fila (2 cajas, la última reserva) ✅ |
| Tiempo total de las 12 solicitudes | 427 ms |

**Conclusión:** el bloqueo de fila (`SELECT … FOR UPDATE`) serializa las reservas y la restricción `UNIQUE (pedido_id, tienda_id)` evita duplicados. Se cumple el criterio.

## 2. Exactitud del reparto del flete

**Hipótesis técnica:** el flete se reparte en pesos enteros, proporcional a las cajas, y la suma es exactamente el flete total.

**Resultado en la base de datos** (pedido demo de gaseosa, flete $40.000, 34 cajas):

| Tienda | Cajas | Flete asignado |
|---|---|---|
| Autoservicio El Vecino | 10 | $11.765 |
| Tienda Doña Rosa | 7 | $8.235 |
| La Esquina de Don Jorge | 6 | $7.059 |
| Tienda Carmencita | 6 | $7.059 |
| Tienda El Paisa | 5 | $5.882 |
| **Total** | **34** | **$40.000** ✅ |

Además, `npm test` ejecuta 5 pruebas automáticas del algoritmo (mayor residuo), incluida una que compara contra este resultado real de Postgres. **5/5 aprobadas.**

## 3. Privacidad entre tiendas (las vecinas no ven tus volúmenes)

**Método:** con la llave pública del navegador se intentó leer directamente las tablas y usar sesiones falsas.

| Intento | Respuesta |
|---|---|
| `GET /participaciones` | 401 — sin permiso ✅ |
| `GET /tiendas`, `/pedidos`, `/sesiones` | 401 — sin permiso ✅ |
| `listar_pedidos` con token inventado | 403 — “Sesión vencida” ✅ |
| `iniciar_sesion` con PIN incorrecto | 403 — “Tienda o PIN incorrecto” ✅ |

Las funciones solo devuelven el total del pedido, el número de tiendas y la participación propia.

## 4. Tiempo real

**Método:** se abrió una conexión al canal `pedidos` y se hizo una reserva.

**Resultado:** el aviso llegó con solo `{ pedido_id }` (sin datos de ninguna tienda); la app vuelve a consultar sus propios datos. Como respaldo, la app refresca cada 20 s y al volver a la pestaña.

## 5. Filtro por zona

El pedido de huevo abierto en Suba (a unos 15 km) no aparece para las tiendas de Timiza (radio 1,5 km, distancia Haversine). Comprobado con la cuenta de Tienda Carmencita: solo aparecen los pedidos de Timiza.

## Limitaciones

- Prueba de carga pequeña (12 solicitudes simultáneas); no se midió con cientos de usuarios.
- Los pagos y precios son simulados; los resultados validan la lógica, no el valor comercial del ahorro (eso es la hipótesis H3, que requiere cotizaciones reales).

## 6. Pruebas automáticas de la lógica en Postgres

`npm test` monta en memoria una base Postgres (PGlite) con **las migraciones reales** y los datos demo, y verifica (11 pruebas, todas aprobadas):

| Prueba | Resultado |
|---|---|
| Pedido demo de gaseosa: suma de cobros = valor de la orden ($1.747.480) y fletes 11.765 / 8.235 / 7.059 / 7.059 / 5.882 | ✅ |
| No se puede abrir un pedido cuyo flete no cabe en el ahorro de la meta | ✅ |
| Si un cobro superara lo retenido, el pedido se anula y se devuelve todo | ✅ |
| Ciclo abierto → confirmado → entregado; lista de entrega solo para la anfitriona | ✅ |
| **300 pedidos aleatorios** (semilla fija) abiertos, con reservas y cerrados: suma exacta en todos los confirmados y ningún cobro mayor que lo retenido | ✅ |
| **10.000 repartos aleatorios** del flete (`lib/prorrateo.ts`) contra una referencia en enteros exactos: suma exacta, desvío < 1 peso | ✅ |

El reparto de Postgres coincide además con `prorratear()` de la prueba de concepto en Python sobre el mismo pedido de gaseosa.

## 7. Calidad en celular

Auditoría con Lighthouse 12 (modo celular) sobre la versión compilada para producción, servida en local:

| Categoría | Pantalla de ingreso |
|---|---|
| Rendimiento | 98 |
| Accesibilidad | 100 |
| Buenas prácticas | 96 |
| SEO | 100 |

Primer contenido visible en 0,8 s y desplazamiento de diseño 0. Además, **axe-core** no encontró problemas de accesibilidad (WCAG 2.1 AA) en ninguna de las 7 pantallas: ingreso, guía, pedidos, sumarse, historial con la explicación del cobro, lista de entrega y movimientos.

**Limitación:** las mediciones son en local con una base en memoria; en el despliegue real los tiempos dependen de la red y de Supabase.
