# Subir v2 a producción — orden de ejecución

Estado verificado el 2026-08-14 contra la base de producción, la cuenta de
Stripe live y los dos proyectos de Vercel. No es de memoria: cada número de
aquí salió de una consulta.

---

## Lo que ya está bien

| | |
|---|---|
| Respaldo de la base | hecho |
| Migraciones pendientes | 10 (0129→0138), **todas aditivas, cero destructivas** |
| Cuenta Stripe live | `acct_1U481XIik6gE7mbQ` · «zero» / Yisrael Technology LLC · US/USD · cobros y payouts **activos**, alta completa |
| Proyecto Vercel | `emitedo-v2`, ya desplegando contra la base de producción |

## Lo que bloquea, y por qué

**1 · `STRIPE_PRICE_PRO` existe en Vercel con el precio VIEJO.** Es la única
variable del catálogo nuevo cuyo nombre coincide con uno del catálogo viejo.
No está «faltando», está **mintiendo**: el código la lee, encuentra un precio
real, y cobra el importe equivocado. Falta sería mejor — fallaría a la vista.

**2 · La cuenta live está vacía.** 0 precios, 0 webhooks, 0 configuración de
portal. Los 9 precios que existen hoy están en **otra cuenta** (la de pruebas,
`acct_1TLpS1...`, que se llama «Viridian Disc»). No se migran: se crean.

**3 · El extracto bancario dice `YIRAEL TECHNOLOGY LLC`.** Le falta la S de
YISRAEL. Es lo que el cliente ve en su estado de cuenta cuando le cobramos, y
un nombre que no reconoce es una devolución de cargo.

**4 · A v2 le faltan 7 variables que v1 SÍ tiene en producción.** v1 lleva
meses funcionando, así que su lista es la línea base probada:
`S3_COMPROBANTES_*` (5), `HABILITACION_ALERT_EMAIL`, `SLACK_WEBHOOK_URL`.
Sin las de S3 se cae adjuntar el comprobante al cobrar, que está en producción
desde el PR #50.

---

## Fase 0 · Tres decisiones

Ninguna la puedo tomar yo.

**0.1 — Colegio Andrés Bello (id 9).** Hoy tiene el módulo escolar encendido y
579 comprobantes emitidos. `multisucursal` es de la familia e-CF y no incluye
`escolar`, así que al encender el cobro lo perdería. Dos salidas:

- `modulos_override` — se lo sostenemos a mano, sin suscripción que no compró
- tramo de colegio (`colegio-*`) — ya trae escolar y POS, pero son US$135–500/mes

Lo mismo aplica al id 2 (Yisrael Technology, nosotros).

**0.2 — `facturacion.zero.com.do`.** Hoy apunta a v1, con clientes vivos
facturando. ¿Se queda en v1 y v2 sale en otro dominio, o se mueve a v2?

**0.3 — ¿Se enciende el cobro?** `NEXT_PUBLIC_BILLING_ENABLED` apagado deja
todo como hoy: los módulos los administramos nosotros y ninguna suscripción
opina. Encendido, el plan manda sobre los módulos y los topes. Se puede subir
v2 con el cobro apagado y encenderlo después — de hecho es lo más seguro.

---

## Fase 1 · Base de datos

Las 10 migraciones, en orden, con `psql`. El journal de drizzle solo llega a
0004: esto se corre a mano.

```
0129_documento_listas
0130_formulario_borradores
0131_documentos_sueltos
0132_avisos_sin_cargo
0133_ciclo_suscripcion
0134_documentos_instrucciones
0135_aviso_solo_lectura
0136_terminos_aceptados
0137_google_login
0138_onboarding
```

**Lo más importante de las diez está en 0138**, y no es una columna:

```sql
UPDATE teams SET onboarding_completado_en = created_at
 WHERE onboarding_completado_en IS NULL;
```

Sin ese UPDATE, las 22 empresas actuales quedan encerradas en el onboarding la
primera vez que entren. Ya está dentro del archivo; lo que hay que hacer es
**no correr solo los ALTER**.

Riesgo real bajo: en producción hay **0 estudiantes y 0 matrículas**, así que
las seis migraciones escolares corren sobre tablas vacías.

Comprobación: 1.232 columnas antes → 1.259 después, 0 columnas perdidas.

## Fase 2 · Planes a las 22 empresas

El SQL está en [`prod-planes-existentes.md`](./prod-planes-existentes.md).
Depende de la decisión 0.1. Incluye poner `subscription_status = 'admin'` en
las 8 filas que lo tienen NULL: con el cobro encendido, un NULL cae en «tu
empresa no tiene un plan activo» y se queda sin emitir.

## Fase 3 · Stripe live — HECHA (2026-08-14)

| | |
|---|---|
| 9 productos y 9 precios | creados y verificados leyendo de vuelta |
| Portal de cliente | `bpc_1U4Yb7Iik6gE7mbQMwxfgF2C`, marca `zero-v2` |
| Webhook | `we_1U4YcKIik6gE7mbQdsMDVDaV`, 6 eventos, activo |

Los importes no se escribieron a mano: se generaron parseando
`lib/config/plans.ts` y se contrastaron contra los precios que ya existían en
la cuenta de pruebas (900/1900/3500/6500/13500/23700/35000/50000/900) — creados
en su día desde el mismo catálogo. Coincidencia exacta, así que el parseo está
comprobado contra algo independiente.

El portal se pre-creó **con la misma marca de metadata que busca el código**
(`zero_portal: 'zero-v2'`, ver `lib/payments/stripe.ts`). El código lo crea
solo la primera vez que alguien lo abre; pre-crearlo evita que el estreno le
toque a un cliente real.

El webhook apunta hoy a `https://emitedo-v2.vercel.app/api/stripe/webhook`.
**Hay que cambiarle la URL cuando se decida el dominio final** (decisión 0.2).

### Pendiente de este bloque

**El extracto bancario sigue diciendo `YIRAEL TECHNOLOGY LLC`** — falta la S.
Es lo único de la fase que no se puede hacer por API: va en el panel de Stripe,
en Configuración → Información del negocio.

## Fase 4 · Variables en Vercel (proyecto `emitedo-v2`, Production)

### Lo de Stripe — HECHO

Las 4 del catálogo viejo eliminadas (`STARTER`, `PRO`, `INVOICE`, `BUSINESS`),
los 9 precios live puestos, y las tres llaves cambiadas a live. Verificado
leyendo los 12 valores de vuelta con `vercel env pull`.

> **`vercel env add` escribe VACÍO en esta versión del CLI (54.14.0).**
> Ni con `--value` ni por stdin: la variable se crea, aparece en `env ls` como
> «Encrypted», y su valor es `""`. Se detectó porque las variables viejas sí se
> leían de vuelta y las nuevas no — si todas hubieran salido vacías, habría
> parecido que el cifrado impide leerlas y se habría dado por bueno.
>
> Lo que sí funciona: la API REST (`POST /v10/projects/<id>/env`) con el token
> de `~/Library/Application Support/com.vercel.cli/auth.json`.
>
> **Verificar siempre con `env pull`, nunca dar por hecho que se escribió.**

### Ojo con lo que esto cambia

`app/(onboarding)/bienvenida/actions.ts` llama a `crearSuscripcionDePrueba`
condicionado a que EXISTA el `priceId`, **no** a `BILLING_ENABLED`. Antes esas
variables no estaban en producción, así que el onboarding se saltaba Stripe en
silencio. Ahora que están, **cada registro nuevo que termine el onboarding crea
un cliente y una suscripción de prueba REALES en la cuenta live.**

No se cobra nada: son 15 días de prueba y al acabarse la suscripción queda en
`paused` por no haber tarjeta. Pero son registros de verdad en la cuenta de
verdad. Si no se quiere todavía, hay dos salidas: quitar las 9 variables de
precio, o condicionar esa llamada a `BILLING_ENABLED`.

### Lo que falta

**Copiar de v1**, que lleva meses funcionando con ellas:

```
S3_COMPROBANTES_BUCKET  S3_COMPROBANTES_KEY_ID  S3_COMPROBANTES_PREFIX
S3_COMPROBANTES_REGION  S3_COMPROBANTES_SECRET
HABILITACION_ALERT_EMAIL  SLACK_WEBHOOK_URL
```

**Nuevas de esta versión**:

```
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET        entrar con Google
APP_HOST  FACTURACION_HOST  POS_HOST          reparto por subdominio
COLEGIO_HOST  ESCOLAR_HOST                    (ver proxy.ts)
SESSION_COOKIE_DOMAIN                         .zero.com.do — sin esto la
                                              sesión no cruza subdominios
NEXT_PUBLIC_SOPORTE_WHATSAPP=18097580266      sin esto el botón no aparece
CONTACTO_EMAIL                                buzón de las demos
NEXT_PUBLIC_BILLING_ENABLED                   decisión 0.3
```

**Revisar**: `BASE_URL` y `NEXT_PUBLIC_APP_URL`. En el `.env` local apuntan a
`http://10.0.0.63:3000`, una IP muerta. Si ese valor llegó a producción, los
enlaces de los correos y el retorno del checkout van a ninguna parte.

## Fase 5 · Dominios

Según [`despliegue-subdominios.md`](./despliegue-subdominios.md): `zero.com.do`
al sitio público, `app.` a entrar/registrarse/cuenta, y `facturacion.`, `pos.`,
`colegio.` a sus módulos. Los CNAME se ponen en midominio.do, que no tiene API
— van a mano.

## Fase 6 · Comprobar en producción

1. Entrar con correo y con Google
2. Registrar una empresa nueva de punta a punta: verificar correo → onboarding
   → primeros pasos en el panel
3. Emitir un comprobante real y ver que la DGII lo acepta
4. Un cobro real de verdad, con una tarjeta de verdad, y confirmar que el
   webhook lo registró en la base
5. Abrir el portal de cliente y comprobar que sale en español

---

## Después de todo

**Rotar la llave `sk_live`.** Se pegó en un chat el 2026-08-14, así que queda
en ese historial. Stripe → Developers → API keys → Roll key, y actualizar la
variable en Vercel.
