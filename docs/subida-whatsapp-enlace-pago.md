# Subida: WhatsApp por plantilla + enlace de pago del padre

Estado a 2026-08-18. Todo verificado en la copia (`v2-local-copia-prod`) y las
migraciones ensayadas sobre una rama sacada de producción. **Nada commiteado ni
desplegado todavía.**

---

## 1 · Qué entra

**WhatsApp por plantilla.** Los avisos del cron dejan de salir como texto libre
y salen por plantilla aprobada, así que llegan aunque la familia no haya escrito
en las últimas 24 h. Panel de administración para gestionarlas, estado de
entrega real por mensaje, y reconciliación de los que fallaron.

**Enlace de pago del padre.** `/pagar/[token]`, público y sin caducidad, uno por
responsable de pago. Enseña todo lo que debe la familia —de todos sus hijos— y
deja subir el comprobante de la transferencia. El colegio lo aprueba desde
`/escolar/pagos`.

**Varias cuentas de banco** por colegio, con su RNC o cédula por cuenta.

**Facturar hermanos juntos.** Una sola factura con los cargos de varios hijos
del mismo responsable, con el beneficiario correcto en cada línea.

**La ficha de la familia** enseña los meses de todos los hijos y permite
facturarlos juntos desde ahí.

---

## 2 · Comprobado

| Qué | Resultado |
|---|---|
| `tsc --noEmit` | limpio |
| `vitest run` | 519 pasan, 6 saltados |
| `next build` | compila (queda un aviso de `rimraf`, de una dependencia transitiva y anterior a esto) |
| Migraciones 0140–0147 | aplicadas sobre una rama sacada de prod, tres pasadas seguidas sin error |
| Datos tras migrar | idénticos: 28 teams, 1245 facturas, 1239 clientes, 1270 pagos |
| Secretos en el diff | ninguno (los `sk_live_*` que salen son fixtures de test) |

---

## 3 · Base de datos

Producción **no tiene ninguna** de las ocho. Se corren con:

```bash
POSTGRES_URL="<url de produccion>" bash scripts/migrar-0140-0147.sh
```

Sin argumentos aplica; con `--comprobar` solo mira y no toca nada. Enseña
siempre a qué host apunta antes de empezar.

| | Qué hace |
|---|---|
| 0140 | `whatsapp_plantillas_aviso` — qué plantilla usa cada aviso |
| 0141 | `whatsapp_plantillas` — almacén local de plantillas |
| 0142 | `+ boton` — si la plantilla lleva botón |
| 0143 | `admin_escolar_datos_pago`, `admin_escolar_links_pago`, `admin_escolar_comprobantes` |
| 0144 | `+ estado_entrega` en avisos — si el mensaje llegó de verdad |
| 0145 | `admin_escolar_cuentas_banco` — **mueve** la cuenta y borra las columnas viejas |
| 0146 | `+ documento` por cuenta |
| 0147 | `+ plantilla_con_link` |

**0145 es la única que borra algo.** Mueve la cuenta configurada a la tabla
nueva *antes* de borrar las columnas de origen, todo dentro del mismo archivo y
de la misma transacción. Está envuelta en comprobaciones de existencia, así que
repetirla no rompe nada — se verificó corriéndola tres veces seguidas.

**Antes de correrlas en producción, sacar una rama de respaldo** en Neon desde
`main`. Es el punto de rollback, y tiene que ser de justo antes:

```bash
neonctl branches create --project-id rapid-wind-65520589 --parent br-quiet-cake-anwf6p0m --name rollback-pre-0140-20260818
```

---

## 4 · Variables de entorno

Ninguna de estas está en producción todavía.

| Variable | ¿Hace falta? | Para qué |
|---|---|---|
| `CRM_ZERO_API_URL` | **sí** | `https://crm.zero.com.do/api/v1` |
| `CRM_ZERO_API_KEY` | **sí** | La `sk_live_` del negocio Zero. Es la que manda los mensajes |
| `CRM_ZERO_PARTNER_KEY` | **sí** | La de 64 hex. Solo sirve para crear negocios, no para enviar |
| `PLANTILLAS_BASE_URL` | no | Por defecto `https://facturacion-v2.zero.com.do`. Es el dominio que va dentro del botón de la plantilla |
| `CRM_BOTONES_PLANTILLA` | no | `1` cuando el CRM aprenda a mandar parámetros de botón. Hoy no sabe |
| `ESCOLAR_AVISOS_ACTIVOS` | no | `1` para encender el cron. **Dejar apagado hasta el final** |
| `ESCOLAR_AVISOS_PAUSA_MS` | no | 1100 por defecto. El CRM admite 60 por minuto **por llave**, y todos los colegios comparten la de Zero |

> **Ojo con las dos llaves del CRM.** Son distintas y no son intercambiables: la
> de partner (64 hex, cabecera `x-partner-key`) solo crea negocios; la `sk_live_`
> del negocio (cabecera `x-api-key`) es la que envía. Confundirlas da un 401 que
> parece un problema de red.

---

## 5 · Orden de encendido

El orden importa: los pasos 1 a 3 no le llegan a ninguna familia, y el 6 sí.

1. **Respaldo.** Rama de Neon desde `main`.
2. **Migraciones.** `scripts/migrar-0140-0147.sh` contra producción.
3. **Variables** en Vercel, con `ESCOLAR_AVISOS_ACTIVOS` **apagado**.
4. **Desplegar.** `vercel deploy --prod --yes` desde el worktree —
   `git push` **no** despliega.
5. **Plantillas.** `npx tsx scripts/sembrar-plantillas-whatsapp.ts`, publicarlas
   y esperar a que Meta las apruebe. Sin plantilla aprobada, un aviso solo llega
   si la familia escribió en las últimas 24 h.
6. **Encender el cron** con `ESCOLAR_AVISOS_ACTIVOS=1`, cuando las cinco estén
   aprobadas y no antes.

---

## 6 · Lo que hay que saber

**Producción tiene 0 alumnos y 0 cargos.** El módulo escolar está desplegado
pero vacío: todo esto se está subiendo a una base sin datos escolares. Se probó
contra la copia, que sí los tiene. La primera carga real es la del colegio, y va
por el documento de puesta en marcha.

**El comprobante no es un pago.** Es una declaración del padre. El cobro sigue
viviendo donde vivía, en `pagos_recibidos` colgado de la factura; aprobar un
comprobante registra el pago por ahí. No hay un segundo libro.

**Quien paga es `clients`, no `admin_escolar_tutores`**, por
`estudiantes.facturar_a_client_id`. El enlace de pago va contra el contacto.

**Un cargo sin factura no se puede cobrar por el enlace**, y la pantalla lo dice
en vez de callárselo.

**Rotar la llave `sk_live_`** del negocio Zero: se pegó en un chat en una sesión
anterior.

---

## 7 · Fuera de esto

- **Aprobar el comprobante abriendo el modal de cobro prellenado** — hoy hay que
  registrar el pago a mano después de aprobar.
- **La ficha de la familia** enseña los meses con una tabla propia. La pantalla
  de período completa —pestañas, menús de tres puntos, orden y paginación— ya
  está extraída a `components/administracion-escolar/PeriodoDetalle.tsx` y la usa
  la ficha del alumno; falta engancharla también en la de la familia.
- **SIGERD está caído**, y no es cosa nuestra: desde una conexión dominicana el
  portal acepta la conexión TCP y nunca contesta al TLS. Igual `minerd.gob.do` y
  `www.minerd.gob.do`. Se comprueba con `scripts/probar-sigerd-rd.sh`.
