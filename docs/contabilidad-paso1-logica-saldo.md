# Paso 1 · Subpasos 1-2 — Lógica de saldo y reglas de inclusión en cartera

> Documenta el comportamiento **actual** de `getCuentasPorCobrar`
> (`lib/db/queries.ts`), verificado contra el código el 2026-07-20 en la rama
> `feature/contabilidad-asientos-reportes`. Es la base contractual sobre la que
> se construyen la priorización de cartera (subpaso 3) y, más adelante, los
> asientos automáticos del Paso 4.

## 1. Fórmula de saldo

Todos los montos están en **centavos** (enteros). Hay dos saldos distintos y el
módulo los usa para cosas diferentes:

```text
saldoFactura = max(0, montoTotal − pagado − ncAplicado)
saldo        = saldoFactura + moraSaldo
```

| Componente | Origen | Detalle |
|---|---|---|
| `montoTotal` | `ecf_documents.monto_total` | Total del documento, ITBIS incluido |
| `pagado` | `SUM(pagos_recibidos.monto_centavos)` de esa factura | Incluye pagos divididos por método: cada línea es una fila |
| `ncAplicado` | `SUM(monto_total)` de NC (tipo 34) ligadas a la factura | Solo NC del **modelo viejo** — ver abajo |
| `moraSaldo` | Saldo vivo de las ND de mora hijas | `SUM(nd.monto_total − pagos de la nd)`, solo las > 0 y no anuladas |

### Por qué `max(0, …)`

Una NC mayor que el saldo restante **no genera deuda negativa** en cartera. El
excedente es crédito a favor del cliente, no una cuenta por cobrar de signo
invertido. Sin el `max(0, …)`, el total de cartera se subestimaría al netear
créditos contra deudas de otras facturas.

### Qué NC restan y cuáles no

Una NC tipo 34 reduce `saldoFactura` solo si cumple **todas**:

- `credito_generado_cents IS NULL` — modelo viejo. Las NC nuevas generan saldo a
  favor del cliente y **no** tocan la factura.
- `estado NOT IN ('ANULADO', 'RECHAZADO')`.
- `codigo_modificacion IS DISTINCT FROM 2` — el código 2 ("corrige texto") no
  tiene efecto monetario.
- Se liga por `origen_documento_id = factura.id`, **o** por
  `ncf_modificado = factura.encf` cuando el e-NCF es real (`LIKE 'E%'`).

## 2. Reglas de inclusión

Una fila aparece en cartera si:

| Regla | Implementación |
|---|---|
| Tiene saldo pendiente | `estado_pago IN ('PENDIENTE', 'PARCIAL')` |
| No está muerta | `estado NOT IN ('ANULADO', 'RECHAZADO')` |
| Es una factura raíz | `mora_origen_id IS NULL` — las ND de mora se agrupan dentro de su factura padre, no son cuentas propias |
| No es nota de crédito | `tipo_ecf != '34'` — las NC acreditan, no se cobran |
| Le queda saldo real | post-filtro en JS: `saldo > 0` |

`PAGADA`, `ANULADA`, `GRATUITA` y `USO` quedan fuera por `estado_pago`. El filtro
**no** discrimina por estado de emisión: entra el e-CF emitido, el `sin-ncf` y el
borrador con cobro en curso, porque los tres representan dinero por cobrar.

## 3. Vencimiento

```text
vencida     = fechaLimitePago != null && fechaLimitePago < hoy && saldoFactura > 0
diasVencido = vencida ? floor((hoy − fechaLimitePago) / 86_400_000) : 0
```

`hoy` es `new Date().toISOString().slice(0,10)` — **UTC**, no America/Santo_Domingo.
Entre 20:00 y 00:00 hora RD la fecha UTC ya avanzó un día, así que una factura
que vence hoy puede marcarse vencida esa noche. Pendiente de corregir.

Nota: `vencida` mira `saldoFactura`, **no** `saldo`. Una factura pagada por
completo que solo arrastra mora viva no cuenta como vencida, aunque su `saldo`
combinado sea > 0.

## 4. Totales

```text
pendiente     = Σ saldo         (de todas las filas incluidas)
vencido       = Σ saldo         (solo filas con vencida = true)
count         = nº de filas
countVencidas = nº de filas con vencida = true
```

Ojo: `vencido` suma el **saldo combinado**, es decir arrastra la mora completa de
la factura vencida, no solo la porción vencida.

## 5. Limitaciones conocidas (bloquean el subpaso 3)

1. **`saldo` se calcula en JS, después del fetch.** El SQL ordena por
   `fecha_emision DESC` y aplica `LIMIT 2000` **antes** de conocer el saldo. No
   se puede ordenar ni paginar por urgencia, monto o antigüedad en servidor sin
   bajar la fórmula a SQL.
2. **El `LIMIT` corta antes de filtrar `saldo > 0`.** Con más de 2000 documentos
   `PENDIENTE`/`PARCIAL`, la cartera queda truncada de forma silenciosa y los
   totales salen incompletos — sin ninguna señal en la UI.
3. **`/api/cuentas-por-cobrar` no reenvía `limit` ni `offset`.** La query ya los
   acepta desde el merge de main, pero la ruta los ignora: siempre pide el tope y
   la tabla pagina en cliente.
4. **Los totales son client-side.** `page.tsx` recalcula `pendiente`/`vencido`
   sobre las filas filtradas en memoria e ignora los totales del servidor. Con
   paginación server-side esto mostraría el total de la página, no de la cartera.
5. **`hoy` en UTC** (ver sección 3).

Corregir 1-4 es el contenido de la Etapa 1 y es prerrequisito de la antigüedad de
saldos y del orden por urgencia.

## 6. Origen escolar

Un cargo escolar **no** entra en cartera por sí mismo. Entra cuando se vincula a
una factura: la factura es el documento cobrable y el cargo conserva el contexto
académico (estudiante, matrícula, período, concepto). Esta regla es la misma que
el Paso 4 aplicará a los asientos — una sola fuente monetaria, sin duplicar el
movimiento.
