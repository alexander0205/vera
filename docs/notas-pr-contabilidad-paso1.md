# Notas del PR — Contabilidad, Paso 1 (cartera)

> Texto pensado para la descripción del PR. Lo de abajo es lo que **Alex necesita
> saber para revisar**, no el detalle de implementación (eso está en
> `docs/seguimiento-contabilidad.md`).

## Qué entra

Paso 1 del plan `docs/plan-contabilidad-vera.md`: cartera y trazabilidad de
cobros. **No entra nada del motor contable** — no hay catálogo de cuentas ni
asientos todavía; eso arranca en el Paso 2.

- Permisos propios `contabilidad:ver` / `:gestionar` / `:configurar`. Antes el
  grupo Contabilidad no tenía permiso propio: cualquiera con acceso al dashboard
  veía Secuencias y Consulta de e-NCF.
- Saldo calculado en SQL, con filtros, orden y paginación en servidor.
- Antigüedad de saldos por cubetas, clicables.
- Panel de detalle que explica el saldo (total, pagado, notas de crédito, mora).
- Gestión de cobro: contactos, notas y promesas de pago (migración `0082`).
- Exportar a Excel y recordatorios de pago por correo en dos pasos (previsualiza
  primero; solo envía tras confirmación explícita).
- Tira de promesas de pago sobre la antigüedad: cuántas pendientes, cuánto
  comprometido y cuántas incumplidas.

## Cambios que tocan cosas que ya estaban en producción

### 1. El reporte de antigüedad va a mostrar cifras más bajas

`getAgingCxC` tenía su propia consulta del saldo, distinta de la que usa la
pantalla de cuentas por cobrar. Las dos le daban **números diferentes al mismo
usuario para lo mismo**. Diferencias:

1. **No restaba las notas de crédito**, así que inflaba la cartera.
2. Otra definición de cobrable (solo e-CF aceptados) → dejaba fuera borradores
   con cobro en curso que la pantalla sí muestra.
3. Contaba las notas de débito por mora como filas propias en vez de agruparlas
   en su factura padre, así que el conteo de facturas pendientes salía alto.

Ahora delega en `getCuentasPorCobrar`: una sola definición de saldo y de
cobrable, la de `docs/contabilidad-paso1-logica-saldo.md`.

**Impacto visible:** medido en el team 9, el reporte pasa de **RD$78,295 a
RD$77,245** — RD$1,050 menos, repartidos entre las tres causas de arriba (de
esos, RD$550 son notas de crédito que la consulta vieja ignoraba; el resto viene
de la definición distinta de cobrable y del conteo de las ND de mora). Verificado
después del cambio: las dos pantallas dan **RD$77,245 y 67 filas**, diferencia
RD$0.00. Afecta a `/dashboard/reportes/cuentas-por-cobrar` y a
`/api/reportes/export?report=cuentas-por-cobrar`.

**Lo que Alex debe decidir:** el número anterior estaba mal, pero si alguien
concilió contra él, va a notar la baja. Si prefieres dejarlo como estaba y
tratarlo aparte, revertir este cambio es aislado — es una sola función,
`lib/reportes/queries.ts`.

### 2. Fix de zona horaria en el cálculo de "hoy"

"Hoy" se calculaba con `new Date().toISOString()`, o sea UTC. Producción corre en
UTC y RD es UTC−4, así que **entre las 20:00 y las 00:00 hora RD el sistema creía
que ya era mañana**. Afectaba a 5 puntos; el grave era `lib/cobranza/recargo.ts`,
que generaba la nota de débito por mora un día antes de tiempo — o sea, **le
cobraba de más al cliente**.

Corregido con `hoyRD()` / `fechaRD()` en `lib/utils/format.ts`, con 13 tests
(`npm run test:unit`).

**Pendiente que no pudimos cerrar (sin acceso a producción):** confirmar si el
bug llegó a dispararse de verdad. Depende de si hay documentos con
`fecha_limite_pago` puesta — sin fecha límite no hay vencimiento y el bug nunca
salta. En la base de dev casi ninguno la tiene, pero eso no dice nada de
producción.

Consulta de **solo lectura** para salir de dudas:

```sql
SELECT count(*) AS total,
       count(fecha_limite_pago) FILTER (WHERE fecha_limite_pago <> '') AS con_fecha_limite
FROM ecf_documents
WHERE estado_pago IN ('PENDIENTE','PARCIAL');
```

- `con_fecha_limite = 0` → el bug nunca disparó, el fix es preventivo.
- `> 0` → hay que revisar si alguna nota de débito por mora se emitió un día
  antes de tiempo, porque eso es dinero cobrado de más a un cliente real.

## Decisiones de implementación que conviene conocer

### Promesas de pago vencidas: sin cron, por ahora

`evaluarPromesasVencidas` marca las promesas vencidas como incumplidas. Se
engancha al **GET de la gestión de una cuenta** — corre al abrir el panel, no por
cron. Es idempotente (solo toca las que siguen en `pendiente`) y son dos UPDATE
indexados por team.

**Compromiso conocido:** una promesa que nadie abre nunca se marca. Hoy no
importa porque ese estado solo se consume en esa pantalla. **El día que se quiera
un aviso automático de "promesa incumplida", o un reporte que las cuente sin que
nadie entre, hay que moverlo a un cron.** El punto de enganche ya está aislado en
una sola llamada, así que el cambio es chico.

### Vista "agrupar por cliente": techo de 500 filas

Agrupar solo la página visible daría grupos partidos, así que la vista agrupada
pide 500 filas de una vez y oculta la paginación. Si la cartera excede 500, sale
un aviso en pantalla con las cifras exactas — no se corta en silencio. Validado
como suficiente para el volumen actual.

### Migración

`0082_cobranza_seguimiento.sql` crea dos tablas nuevas (`cobranza_eventos`,
`cobranza_seguimiento`). **No toca ninguna tabla existente.**

## Cómo probarlo

Sembrar escenarios y abrir `/dashboard/cuentas-por-cobrar`:

```bash
npx tsx scripts/seed-cartera-escenarios.ts 9
```

Todo lleva el prefijo `SEEDCXC`, así que no se mezcla con datos reales.
`--limpiar` lo borra. Casos que vale la pena mirar:

| Caso | Qué demuestra |
|---|---|
| `SEEDCXC-CONMORA` | Mora que ignora una ND anulada |
| `SEEDCXC-CONNCID` | Nota de crédito restando del saldo |
| `SEEDCXC-VENC100` | Cubeta +90 días |
| `SEEDCXC-SALDADAMORA` | Factura saldada que sigue en cartera solo por su mora |

Suite de validación contra datos reales: `npx tsx scripts/validar-cartera.ts`
(37 comprobaciones).

## Envío de correos: verificado de punta a punta

El envío real se probó contra un correo propio del equipo (se puso en un
documento sembrado, se envió a ese único destinatario y **se revirtió el dato
después**). Resultado: 1 enviado, 0 fallidos, y el evento `contacto`/`correo`
quedó en el historial de gestión de la cuenta con usuario y fecha.

Guardas que tiene el envío:

- **Dos pasos.** Sin `confirmar: true` solo previsualiza; no sale ningún correo.
- **Tope de 50 por lote**, cortado tanto en la UI como en la API.
- **Permiso `facturas:crear`**, no el de solo lectura: escribirle a un cliente es
  una acción hacia afuera.
- **El destinatario no es configurable.** Sale de `email_comprador` de las
  facturas seleccionadas; no hay forma de redirigirlo desde la petición.
- Cada envío deja evento de gestión y entrada de auditoría.

## Lo que NO se pudo verificar

- **`fecha_limite_pago` en producción** (ver arriba). Es lo único que queda
  abierto, y necesita acceso a la base de producción.
