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
