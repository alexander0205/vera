# Subdominios de Zero — qué hacer antes de subir a producción

Estado: **código listo y dormido**. Nada de esto cambia el comportamiento
actual hasta que se pongan las variables de entorno. Se puede desplegar hoy sin
mover nada.

## El reparto

| Dominio | Qué sirve | Proyecto |
|---|---|---|
| `zero.com.do` | Marketing | **Aparte** — ver más abajo |
| `app.zero.com.do` | Entrar, registrarse, verificar correo, onboarding, cuenta | El de la app |
| `facturacion.zero.com.do` | Facturación electrónica | El de la app |
| `pos.zero.com.do` | Punto de venta | El de la app |
| `colegio.zero.com.do` | Colegios | El de la app |

Un solo proyecto de Vercel para los cuatro últimos. Comparten sesión, base de
datos, componentes y permisos: partirlos en cuatro despliegues duplicaría todo
eso sin ganar nada.

Marketing sí va aparte, y es lo único que se gana de verdad separando: una
landing no tiene por qué descargar el bundle de un ERP.

## Antes de empezar: dos decisiones sin cerrar

**1. ¿`facturacion.zero.com.do` se queda en v1 o pasa a v2?**

Hoy ese dominio es **producción viva de v1**: hay empresas facturando ahí ahora
mismo. Si v2 se lo queda, esto deja de ser configurar un dominio y pasa a ser
migrar clientes que están trabajando. Nada de este documento debe ejecutarse
sobre ese dominio hasta que esa decisión esté tomada.

Mientras tanto se puede montar todo lo demás — `app.`, `pos.`, `colegio.` — sin
tocarlo.

**2. ¿Qué cuenta de Stripe?**

Los precios viven en `acct_1TLpS1…` («Viridian Disc»). La otra cuenta es
`acct_1PrJ2O…` (Yisrael Technology LLC). El webhook de producción depende de
esto y del dominio, así que conviene cerrarlo antes de registrar nada en live.

## Orden de ejecución

El orden importa: la cookie antes que los dominios, y los dominios antes que
Google.

### 1. Cookie compartida

```
SESSION_COOKIE_DOMAIN=.zero.com.do
```

Sin esto, cada subdominio pide iniciar sesión por su cuenta. Con esto, la
sesión vale para todos.

> El punto inicial no es un error de tecleo: es lo que hace que la cookie valga
> para los subdominios y no solo para el dominio exacto.

**Efecto secundario a saber:** una cookie a nivel de dominio raíz llega también
a `zero.com.do`. Si el marketing va en otro proyecto, mejor que no comparta ese
dominio de cookie.

### 2. Dominios en Vercel

Los cuatro apuntando al proyecto de la app:

```bash
vercel domains add app.zero.com.do
vercel domains add pos.zero.com.do
vercel domains add colegio.zero.com.do
# facturacion.zero.com.do — solo cuando esté decidido el punto 1 de arriba
```

DNS: un `CNAME` por subdominio a `cname.vercel-dns.com`.

### 3. Variables de host

```
APP_HOST=app.zero.com.do
POS_HOST=pos.zero.com.do
COLEGIO_HOST=colegio.zero.com.do
FACTURACION_HOST=facturacion.zero.com.do
```

`APP_HOST` es el interruptor real: mientras no exista, el bloque de
centralización de `proxy.ts` no hace nada y todo sigue como hoy. Ponerla es lo
que enciende el reparto.

`COLEGIO_HOST` y `ESCOLAR_HOST` son equivalentes; gana el primero. El módulo se
llama `escolar` por dentro y `colegio` de cara al cliente.

### 4. URLs base

```
BASE_URL=https://app.zero.com.do
NEXT_PUBLIC_APP_URL=https://app.zero.com.do
```

**Hoy estas dos apuntan a `http://10.0.0.63:3000` y `:3004`**, una IP que no
existe. Rompen el retorno del checkout de Stripe y los enlaces de todos los
correos. Hay que corregirlas sí o sí, con subdominios o sin ellos.

Van a `app.` porque de ahí cuelgan verificación de correo, recuperación de
contraseña e invitaciones.

### 5. Google

Un solo redirect URI, porque el login vive solo en `app.`:

```
https://app.zero.com.do/api/auth/google/callback
```

Ésa es la ventaja concreta de centralizar el login: uno en vez de cuatro.

En **Branding** hay que subir el logo (PNG 120×120 — está generado) y poner las
URLs de `/terminos` y `/privacidad`. Subir el logo dispara la revisión de marca
de Google, que tarda días.

### 6. Stripe

- Webhook de producción a `https://app.zero.com.do/api/stripe/webhook`, con los
  6 eventos que el manejador atiende.
- El `whsec_` que devuelva Stripe va a `STRIPE_WEBHOOK_SECRET` de producción.
- Cambiar el nombre del negocio: hoy es **«Viridian Disc»**, el nombre
  automático de Stripe, y sale en la pantalla de pago **y en el extracto
  bancario del cliente**. Un colegio que ve ese cargo llama al banco a
  desconocerlo.
- Apagar Adaptive Pricing (muestra DOP).
- Recrear los 9 precios en modo live y cambiar `sk_test_` por `sk_live_`.

## Comprobar después de encender

1. Entrar por `facturacion.` y comprobar que `/sign-in` **rebota a
   `app.zero.com.do/sign-in`** con la ruta intacta.
2. Iniciar sesión en `app.` y navegar a `pos.` y `colegio.` **sin volver a
   entrar** — eso prueba la cookie compartida.
3. `pos.zero.com.do/` → `/pos`; `colegio.zero.com.do/` → `/escolar`;
   `facturacion.zero.com.do/` → `/dashboard`.
4. Registrarse de cero: el correo de verificación debe llevar a `app.`, no a
   una IP ni a `vercel.app`.
5. Entrar con Google desde `app.` sin `redirect_uri_mismatch`.
6. Un evento de Stripe que llegue con 200.

## Volver atrás

**Borrar `APP_HOST`.** Con eso el reparto se apaga y todo vuelve a servirse
desde cualquier host, como hoy. No hace falta revertir código ni redesplegar
nada más.

Si además se quitara `SESSION_COOKIE_DOMAIN`, las sesiones abiertas se caen
—la cookie cambia de ámbito— y todo el mundo tendría que volver a entrar. No es
una pérdida de datos, pero conviene saberlo antes de tocarlo un lunes por la
mañana.

## Riesgos conocidos

**Cambiar de módulo pasa a ser recarga completa.** Hoy es una navegación dentro
de la app; con subdominios cada salto entre Facturación y Colegios tira el
caché de SWR y vuelve a descargar el bundle. Es el peaje de esta arquitectura y
se paga a cambio de claridad de marca.

**Un `APP_HOST` mal escrito.** `proxy.ts` compara el host de destino contra el
actual antes de redirigir precisamente para que un valor equivocado no produzca
un bucle en `/sign-in` — que es la única avería de la que no se sale entrando a
arreglarla. Aun así, verificar el valor antes de guardarlo.

**Enlaces del portal de familias.** `/d/<token>` y `/f/<token>` se arman con el
host desde el que se generan (`origenPublico`). Un enlace creado desde
`colegio.` queda en `colegio.`, que es lo correcto — pero los enlaces ya
enviados siguen apuntando a donde se crearon.
