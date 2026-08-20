# Brief — rehacer la pantalla de Suscripción

Para quien tome esto: el código, los comentarios y los commits van en ESPAÑOL.
Archivo principal: `app/(dashboard)/dashboard/suscripcion/page.tsx` (~560
líneas) y `_change-plan.tsx` al lado.

---

## Qué es esta pantalla y para quién

Es donde alguien que YA compró entra a resolver una de cuatro dudas:

1. ¿Qué tengo contratado y cuánto pago?
2. ¿Cuánto me queda de prueba y qué pasa cuando se acabe?
3. ¿Me conviene otro plan?
4. ¿Qué pierdo si me cambio?

Hoy contesta la 1 a medias, la 2 en una pastilla de 22 píxeles, la 3 con una
lista plana y **la 4 no la contesta hasta que ya hiciste clic**.

## La tensión que hay que resolver, no esquivar

El usuario pidió que se parezca a la página de precios pública
(`zero.com.do/precios`), y a la vez dijo *«aunque no se debería ver así
exactamente»*. Las dos cosas son ciertas y hay que sostenerlas:

- **La pública VENDE.** Tarjetas grandes, «MÁS ELEGIDO», la tarjeta oscura del
  plan tope, el ∞ del lazo, comparativa desplegable. Está escrita para alguien
  que todavía no confía.
- **Esta es de AJUSTES.** Quien entra ya pagó. Lo que necesita es leer su
  situación de un vistazo y actuar, no que le vendan otra vez.

Lo que SÍ hay que traerse de la pública: **el lenguaje visual**. Que las
tarjetas de plan se reconozcan como las mismas tarjetas, que el ∞ signifique lo
mismo en los dos sitios, que los precios se compongan igual. Lo que NO: el peso
de portada, los ganchos de venta, el «MÁS ELEGIDO».

**Ojo con lo técnico:** la pública es **Tailwind puro**; la aplicación es
**MUI v9**. Parecerse no puede ser copiar y pegar — hay que reconstruir el
lenguaje con las herramientas de aquí. No metas Tailwind en la app ni MUI en la
pública.

---

## Lo que YA existe y NO hay que rehacer

Esto es lo más importante del brief. Casi todo lo que se pide está construido;
lo que falla es que no se ve.

### El aviso de «vas a perder datos» — YA ESTÁ, y es bueno

`lib/suscripcion/cambio-plan.ts` → `validarCambioDePlan()`. Comprueba ocho
cosas contra la base y distingue **dos gravedades**:

| | |
|---|---|
| **BLOQUEA** | el cambio dejaría datos huérfanos o una operación a medias |
| **AVISA** | el cambio es válido pero pierde algo que conviene saber |

Los ocho motivos: cambio de familia, estudiantes sobre el tramo, módulo con
datos dentro, módulo que se apaga, turno de caja abierto, usuarios de más,
comprobantes sobre el tope, recurrentes activas.

`_change-plan.tsx` ya los pinta en `bloqueos` y `porConfirmar`, y la API
devuelve 409 con los avisos si no llega `confirmado`.

**El problema:** todo eso aparece DESPUÉS de pulsar «Contratar». El usuario
descubre que perdería 442 estudiantes cuando ya decidió. Hay que subir esa
información a la tarjeta del plan, **antes del clic** — aunque sea en corto
(«perderías el módulo Colegio») con el detalle al confirmar.

### El estado del ciclo de vida — YA ESTÁ

`lib/suscripcion/estado.ts` → `evaluarSuscripcion()`, función pura sobre las
columnas del team. Devuelve `estado`, `puedeEscribir`, `diasRestantes`,
`avisar`, `mensaje`, `cancelacionPendiente`. Los estados: `sin-billing`,
`prueba`, `prueba-por-vencer`, `activa`, `mora`, `solo-lectura`, `cerrada`.

Es el MISMO objeto que usa el guard del servidor, así que lo que la pantalla
dice y lo que el sistema hace no pueden contradecirse. **Úsalo, no lo
recalcules.**

### El bloque de prueba — recién puesto, revísalo

Ya hay un bloque que dice los días que quedan y qué pasa al terminar, y cambia
según haya tarjeta o no (`tieneMetodoDePago`). Está sin ver con ojos: la ruta
pide sesión. **Verifícalo y mejóralo, no lo dupliques.**

### La otra línea comercial — recién puesta

`familiasOfrecibles()` en `lib/config/plans.ts` abre solo el salto seguro:
desde e-CF se ofrece la línea de colegio (se gana el módulo), desde colegio no
se ofrece bajar (se perderían los estudiantes). Va en su propia tarjeta.

### El desglose del precio — recién puesto

`US$65 Ilimitado + US$9 Punto de Venta`. Los adicionales que el plan ya incluye
no se listan.

---

## Lo que falta de verdad

1. **El riesgo del cambio, antes del clic.** Ver arriba. Es el punto 4 del
   usuario y el que más duele.

2. **La prueba no se lee como lo primero de la pantalla.** Si a alguien le
   quedan 3 días, eso es lo único que importa y debería dominar. Hoy compite
   con los medidores.

3. **La comparativa no se parece a la pública.** Allí el «sin tope» se dibuja
   con el lazo ∞; aquí dice «ilimitados» en texto. La misma idea contada de
   dos formas distintas en el mismo producto.

4. **No se distingue lo que se puede contratar de lo que no.** Todos los planes
   se ven igual, aunque uno de ellos te bloquearía.

5. **`estadoDelTramo` y los medidores.** Están bien pero enterrados dentro de
   la tarjeta del plan. Un colegio con 442 de 300 estudiantes debería verlo
   antes que su precio.

---

## Datos y estados con los que hay que probar

En producción **todas las empresas tienen `subscription_status = 'admin'`**, que
`evaluarSuscripcion` traduce a acceso abierto sin pasar por Stripe. Así que con
una cuenta real **nunca verás el estado de prueba**. Para probarlo de verdad
hay que montar los casos a mano contra la copia (`.env.local`, que apunta a una
COPIA de producción, ahí sí se puede escribir):

- `trialing` con `trial_end` a 12 días → estado `prueba`
- `trialing` con `trial_end` a 2 días → `prueba-por-vencer` (cambia el tono)
- `trialing` vencido → `solo-lectura`
- `paused` — prueba acabada sin tarjeta
- `past_due` con `moroso_desde` → `mora`
- `canceled` con `periodo_fin` futuro → sigue activa hasta esa fecha
- `active` normal
- `admin` — lo que hay hoy en producción

Y para el riesgo del cambio: un colegio con más estudiantes que el tramo al
que baja, un team con un turno de caja abierto, uno con recurrentes activas.

## Reglas de la casa

- **Todo sale del catálogo** (`lib/config/plans.ts`). Ni un precio, ni un tope,
  ni un nombre escrito a mano: es el mismo archivo del que salen el checkout de
  Stripe y los límites que se aplican. Una cifra copiada se desincroniza del
  cobro real el día que suba un plan, y esto factura.
- **Comentarios que expliquen el PORQUÉ**, no el qué. Si descartas una
  alternativa, el comentario dice cuál y por qué. Tono: `lib/config/plans.ts`,
  `proxy.ts`, `lib/suscripcion/estado.ts`.
- **No prometas lo que el sistema no hace.** Ya pasó una vez: el plan se
  llamaba «Multi-sucursal» y aquí `sucursal` es un texto que se imprime en la
  factura.
- `npx tsc --noEmit` limpio y `npx vitest run` sin regresiones (hoy 435 pasan,
  6 saltados). **Lee la línea de conteo, no la duración.**
- **No commitear ni desplegar.** Se revisa antes.
- Lo que no puedas verificar, **dilo**. No lo des por bueno.

## Cómo se ve el resultado

Alguien con 3 días de prueba entra y, sin desplazarse, sabe: cuántos días le
quedan, qué pasa cuando se acaben, qué tiene contratado, cuánto pagará y por
qué. Y si toca otro plan, ve lo que perdería **antes** de decidir, no después.
