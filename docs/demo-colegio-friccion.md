# Registro de fricción — montaje de "Colegio Demo Zero"

Entregable secundario del montaje de la cuenta demo. Cada entrada es algo que
tardó de más, obligó a algo raro, o rompió. Se escribe en el momento, no al final.

---

## F-01 · Cerrar sesión no cerraba la sesión (seguridad) · **ARREGLADO**

**Cuándo:** antes de empezar la Fase 0. Reportado por el dueño del proyecto y
confirmado por accidente: el navegador seguía cargando el dashboard con datos
después de haber "cerrado sesión".

**Qué pasaba:** la cookie de sesión se crea con `domain=.zero.com.do` —el SSO
entre subdominios, que es intencional— pero los cuatro sitios que la borraban
llamaban `delete('session')` sin repetir ese atributo. Un `Set-Cookie` que borra
solo mata la cookie si lleva el mismo `domain`; sin él apunta a una cookie
host-only que en producción no existe. La real sobrevivía.

Como el redirect al login va después pase lo que pase, la pantalla decía que
habías salido mientras la sesión seguía viva en `facturacion.*`, `pos.*`,
`colegio.*` y `app.*`.

**Impacto:** en una computadora compartida, el siguiente que se sentara entraba
a la cuenta. `SESSION_COOKIE_DOMAIN=".zero.com.do"` está puesta en Production
desde hace 4 días, así que la ventana de exposición empieza ahí.

**Sitios:**

| Archivo | Qué hace |
|---|---|
| `app/(login)/actions.ts:195` | `signOut()` — el reportado |
| `app/(login)/actions.ts:303` | Eliminar cuenta — borras la cuenta y la sesión queda |
| `app/api/user/route.ts:51` | `DELETE /api/user` |
| `proxy.ts:152` | Sesión corrupta o expirada: no lograba expulsar |

**Arreglo:** `clearSession()` en `lib/auth/session.ts`, junto a `setSession()`,
para que el `domain` se decida en un solo lugar. `proxy.ts` va aparte porque
corre en el runtime del proxy y no puede usar `cookies()` de `next/headers`.

**Prueba:** `tests/unit/cierre-sesion-cookie.test.ts`, 4 casos. Verificado que
atrapa el bug de verdad: con el código anterior fallan los 4, con el arreglo
pasan los 4.

**Estado:** arreglado en la rama, `tsc` limpio, 570 tests verdes. **Sin desplegar.**

---

## F-02 · Crear empresa e invitar a un correo que ya tiene cuenta = empresa huérfana

**Cuándo:** al preparar la Fase 0, leyendo `crearEmpresa` antes de usarla.

**Qué pasa:** en `app/admin/empresas/nueva/actions.ts:66`, antes de mandar la
invitación se consulta si el correo "ya existe":

```ts
const existing = await db
  .select({ id: users.id })
  .from(users)
  .leftJoin(teamMembers, and(eq(teamMembers.userId, users.id), eq(teamMembers.teamId, team.id)))
  .where(eq(users.email, inviteEmail))
  .limit(1);

if (!existing.length) { /* crear invitación y enviar correo */ }
```

El `leftJoin` sugiere que la intención era "¿ya es miembro de ESTE team?", pero
el `select` solo trae `users.id` y la condición mira `.length`, así que **el join
no filtra nada**: cualquier usuario que exista en la plataforma, aunque sea de
otra empresa, hace que `existing.length` sea 1.

Y el team acaba de crearse, así que nadie puede ser miembro todavía — la rama
correcta nunca se ejecuta para un correo con cuenta.

**Consecuencia:** la empresa se crea, se siembran sus 10 secuencias e-NCF, y
**no se manda ninguna invitación**. Sin error, sin aviso. Queda una empresa con
cero miembros — y en el panel de admin no hay ninguna acción para agregar uno
después: `_role-select.tsx` solo cambia el rol de quien ya está dentro. La
empresa queda inalcanzable.

**Contraste:** el camino normal, `POST /api/equipo/invitaciones:91`, lo hace
bien — `innerJoin` y filtro por `teamId`, así que solo bloquea a quien ya es
miembro de ese team.

**Huella en producción:** el **team 6** (CETHA) — 0 miembros, 0 invitaciones,
creado el 2026-05-16. El **team 7** tiene nombre y RNC idénticos y la misma
fecha: la crearon, no pasó nada, y la volvieron a crear por otro camino.

**Arreglo:** se quitó la consulta. La pregunta correcta sería «¿ya es miembro de
ESTE team?» y en ese punto la respuesta es siempre no —el team se acaba de crear
dos líneas antes—, así que no hay nada que preguntar. Quien invita a un team que
ya existe pasa por `POST /api/equipo/invitaciones` o por `invitarUsuario` del
panel de admin, que sí lo comprueban bien.

**Estado:** arreglado. **Sin desplegar.**

---

## F-03 · No hay camino a la demo sin el usuario platform-admin

**Cuándo:** Fase 0, buscando cómo empezar sin depender de un login ajeno.

**Qué se intentó:** `POST /api/empresa` deja que cualquier usuario con sesión
cree una empresa y quede `owner` de una vez — sin panel de admin, sin invitación,
sin el bug F-02.

**Por qué no sirve:** ese camino asigna `planName: FREE_PLAN.key`, y el plan
Gratis trae `{ docs: 0, users: 1, modulos: MODULES_BASE }`. Con
`NEXT_PUBLIC_BILLING_ENABLED="true"` en Production, esos límites muerden:

- `docs: 0` → **cero comprobantes**, no se puede hacer nada de la Fase 1
- `users: 1` → no se puede invitar a nadie
- `MODULES_BASE` → sin módulo escolar, no hay Fase 3

Y cambiar el plan de una empresa existente solo se puede desde
`/admin/empresas/[id]` (`_plan-select.tsx`), que otra vez pide platform-admin.

**Consecuencia:** el montaje entero está bloqueado hasta que alguien inicie
sesión como `alexander.ferreras@yisraeltech.com` — el único usuario con
`platform_role = 'admin'` en toda la base de producción. Escribir contraseñas no
está permitido, así que ese paso lo tiene que dar un humano.

**Dato aparte:** ese usuario es platform-admin pero no es miembro de ninguna
empresa. Al entrar cae en `/dashboard` sin team — habría que ver qué muestra esa
pantalla en ese estado.

**Estado:** bloqueado, esperando el login.

---

## F-04 · Quitar al último miembro deja la empresa muerta · **ARREGLADO**

**Cuándo:** revisando por qué el team 23 tenía una invitación `accepted` y aun
así cero miembros.

**Qué pasaba:** `eliminarMiembro` en `app/admin/empresas/[id]/page.tsx:87` borra
la fila de `team_members` sin contar cuánta gente queda. `cambiarRolMiembro` sí
frena al último *owner*, pero eliminar no frenaba nada — y el problema no es
quedarse sin propietario, es quedarse sin nadie.

**Huella en producción:** el **team 23** (COLEGIO MONTESSORI PEKE KINGS).
El registro de actividad lo cuenta entero:

```
ACCEPT_INVITATION    user 36   2026-08-05 18:19
REMOVE_TEAM_MEMBER   user 1    2026-08-10 14:38
```

Aceptó, entró, y cinco días después lo sacaron. La empresa quedó sin nadie. La
única invitación pendiente que le quedaba venció el 2026-08-11.

**Arreglo:** se cuentan los miembros antes de borrar; con uno solo se rechaza y
se vuelve con `?error=ultimo_miembro`.

**Estado:** arreglado. **Sin desplegar.**

---

## F-05 · Server action muerta pero alcanzable, y sin ninguna comprobación · **ARREGLADO**

**Cuándo:** buscando qué camino había vaciado el team 23.

**Qué pasaba:** `removeTeamMember` en `app/(login)/actions.ts:332` no la llamaba
ninguna pantalla —el grep solo encontraba su propia definición— pero seguía
exportada desde un archivo `'use server'`. Un server action exportado **es un
endpoint HTTP con su propio id**, exista o no una UI que lo use.

Y no comprobaba nada más allá de haber iniciado sesión: cualquier miembro podía
sacar a cualquier otro de su empresa, incluido el único propietario. Los dos
frenos del camino bueno —`DELETE /api/equipo/miembros/[id]`: solo el owner saca
a otros, y no deja borrar al único owner— se saltaban enteros.

**Arreglo:** borrada, con la nota de por qué, igual que se hizo antes con
`inviteTeamMember`.

**Estado:** arreglado. **Sin desplegar.**

---

## F-06 · RETIRADO — el panel de admin sí puede agregar miembros

Se anotó como hueco («no hay forma de agregar un miembro a una empresa
existente») y era falso. `invitarUsuario`, en la misma pantalla
`/admin/empresas/[id]:43`, lo hace bien: `innerJoin` con filtro por `teamId`,
comprueba invitación pendiente, manda el correo.

Vale la pena dejarlo escrito: el patrón correcto ya existía en el mismo archivo
que el roto. `crearEmpresa` era la excepción, no la regla — y las 4 empresas
huérfanas de producción se pueden recuperar desde esa pantalla.


---

## F-07 · El proxy borraba la cookie sobre una respuesta que tiraba · **ARREGLADO**

**Cuándo:** verificando en producción que F-01 había quedado bien. Este no lo vio
la lectura del código — lo destapó la comprobación empírica.

**Cómo se vio:** una petición a una ruta protegida con una cookie de sesión
corrupta debería responder con un `Set-Cookie` que la borra. No traía ninguno:

```
$ curl -D - https://app.zero.com.do/dashboard -H "Cookie: session=basura.invalida.token"
HTTP/2 307
location: https://app.zero.com.do/sign-in
(sin set-cookie)
```

**Qué pasaba:** en el `catch` de `proxy.ts` el borrado se aplicaba a `res`, pero
si la ruta era protegida se devolvía un `NextResponse.redirect` **nuevo**. `res`
se descartaba entero y el borrado con él.

Fallaba exactamente en el caso que importa —sesión rota entrando a una ruta
protegida— y la cookie mala sobrevivía a todas las peticiones siguientes.

**Arreglo:** se decide primero cuál es la respuesta de salida, se borra sobre
esa, y se devuelve. El `domain` de F-01 se conserva.

**Lección:** F-01 se dio por bueno con `tsc`, 570 tests y una lectura de los
cuatro sitios. El quinto solo apareció al pedirle a producción que lo demostrara.
Con un bug de sesión, la única prueba que vale es la respuesta HTTP.

**Estado:** arreglado. **Sin desplegar** al momento de escribir esto.


---

## F-08 · Pantalla en blanco al cerrar sesión · **ARREGLADO**

**Cuándo:** reportado por el dueño justo después de desplegar F-01. Primera
sospecha: regresión mía. No lo era, pero mi arreglo la sacó a la luz.

**Qué se veía:** cerrar sesión dejaba `/sign-in` completamente en blanco.
Recargar a mano lo arreglaba.

**Diagnóstico.** Dos cosas tenían que coincidir, y coincidían:

1. **El shell de `/sign-in` estaba vacío.** `Login` lee `useSearchParams`, así
   que va dentro de un `<Suspense>` — pero sin `fallback`. Con PPR el shell
   estático de la ruta *es* lo que pinte el fallback, o sea nada: el HTML del
   servidor traía 51 caracteres, solo el `<title>`. Reproducido con `curl` y
   también en local. El propio HTML dice por qué el hueco no se rellena en
   servidor:

   ```html
   <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
   ```

   Ese trozo lo pinta el cliente o no lo pinta nadie.

2. **El logout navegaba suave.** `handleSignOut` hacía
   `router.push('/sign-in')`, que sirve la entrada de la caché del router —el
   shell vacío— sin ir al servidor. Sin JS que rellenara el hueco, ahí se
   quedaba.

Por eso una carga fresca del navegador se veía perfecta y solo fallaba viniendo
de cerrar sesión.

**Lo que se descartó por el camino:** el layout `(login)/layout.tsx` que se había
agregado para Google Analytics. Se quitó, se reconstruyó y `/sign-in` seguía
vacío — no era eso.

**Arreglo, dos partes, cada una se sostiene sola:**

- `handleSignOut` sale con `window.location.href`, carga completa. Además de
  arreglar esto, **tira la caché del router**, que después de cerrar sesión
  guarda respuestas RSC con datos del usuario que se acaba de ir.
- `/sign-in` y `/sign-up` reciben `fallback={<EsqueletoDeAcceso />}`, en
  `app/(login)/_esqueleto.tsx`, con el mismo marco de dos columnas para que no
  salte al llegar el formulario. El shell pasó de 0 a 10 divs.

**Prueba:** `tests/unit/pantalla-acceso-no-vacia.test.ts`, 9 casos. Son
comprobaciones sobre el código y no un render, a propósito: el bug era
justamente que en servidor no se renderiza. Verificado que atrapa: revertidas
las dos partes, fallan 4.

**Estado:** arreglado. **Sin desplegar** al momento de escribir esto.


---

## F-09 · Con la cookie vencida, los módulos servían una pantalla en blanco en vez de mandar al login · **ARREGLADO**

**Cuándo:** reportado por el dueño. Entró, cerró sesión, y volvió por la URL:
`facturacion.zero.com.do` lo mandó al login (bien), `pos.zero.com.do` se quedó
en blanco.

**Reproducido con `curl`** — cookie presente pero inservible:

```
$ curl -D - https://pos.zero.com.do/ -H "Cookie: session=cookie.vieja.invalida"
HTTP/2 200          ← ni redirige al login ni borra la cookie
(cuerpo: 19 caracteres de texto)
```

Los tres módulos igual: `pos.` 19 chars, `facturacion.` 51, `colegio.` 26.
Sin cookie los cuatro hosts redirigían bien — el fallo pedía una cookie mala.

**Qué pasaba.** El guard del proxy era:

```ts
if (isProtectedRoute && !sessionCookie) { … }   // ¿la cookie EXISTE?
```

Preguntaba por la **presencia**, no por la validez. Una cookie caducada, firmada
con otro secreto o corrupta lo pasaba igual que una buena. Y los rewrites de los
subdominios de módulo —`pos` → `/pos`, `facturacion` → `/dashboard`, `colegio`
→ `/escolar`— retornan antes del bloque que sí verifica el token, así que se
servía el módulo entero sin sesión.

Es la misma familia que F-01 y F-07: el sistema *creía* que había sesión.

**Arreglo:** el token se verifica arriba del todo, una sola vez, y el guard
pregunta por `sesion`, no por la cookie. Si venía una cookie que no sirve, se va
con esa misma respuesta —dejarla puesta condena a repetir el rodeo en cada
petición. De paso: la raíz del host de cuenta decidía también por presencia y
mandaba a `/cuenta` para que el guard rebotara de vuelta, y el token se estaba
verificando dos veces por petición.

**Verificado local con `SESSION_COOKIE_DOMAIN` puesta:** `pos.`, `facturacion.`,
`colegio.` y `app.` responden 307 a `/sign-in` **y** borran la cookie en la
misma respuesta.

**Estado:** arreglado. **Sin desplegar** al momento de escribir esto.
