# Investigación: ¿Cómo hacer que funcione sin internet?

**Para:** Alex
**Fecha:** 28/07/2026
**Estado:** Investigación técnica — pendiente definir alcance antes de estimar

---

## Resumen ejecutivo

La app hoy es **100% dependiente de internet por diseño**: cada pantalla se arma en
el servidor y consulta la base de datos en la nube (Neon). Sin conexión, la aplicación
no carga.

Además, emitir un Comprobante Fiscal Electrónico (e-CF) **requiere internet por ley**:
un e-CF solo es válido cuando llega a la DGII. No existe "emitir 100% offline para
siempre"; lo máximo que permite la normativa es **capturar la venta offline y transmitir
después** cuando vuelve la conexión (modo contingencia).

Por eso, antes de estimar esfuerzo, hay que aclarar **qué se entiende por "sin internet"**,
porque hay dos lecturas muy distintas y con costos muy distintos (ver sección "Qué hay
que decidir").

---

## Cómo está construida la app hoy (los hechos)

| Componente | Realidad | Implicación offline |
|---|---|---|
| Renderizado | Server-side (Next.js App Router). Cada pantalla se arma en el servidor. | Sin internet no se pinta ninguna pantalla. Los datos no viven en el navegador. |
| Base de datos | Postgres en **Neon (nube)**, conexión por TCP. | Toda consulta necesita el servidor + la nube. |
| Emisión de e-CF | El servidor firma y envía a un microservicio (`ECF_API`) que a su vez transmite a la DGII, de forma **síncrona**. | Emitir depende de internet y de que la DGII responda. |
| Recepción de e-CF | La app también **recibe** comprobantes de terceros vía endpoints DGII. | Inherentemente online. |
| PWA | Ya existe un *manifest* (la app es instalable como ícono en escritorio/celular)... | ...pero **no hay *service worker***, así que hoy no hay caché ni capacidad offline. La base está a medias. |

**El muro:** offline real ≠ "no necesitar internet nunca". El techo legal es
**capturar offline y transmitir diferido**. Hoy la emisión es síncrona y no existe una
cola de transmisión, así que ni siquiera eso está soportado todavía.

---

## Opción A — "Sin internet" = la aplicación completa

Cuatro niveles, de menor a mayor esfuerzo. Cada nivel incluye al anterior.

### Nivel 1 — Hoy
- **Qué da:** nada offline. 100% online.
- **Sin internet:** pantalla en blanco.

### Nivel 2 — PWA de solo lectura (bajo esfuerzo, ~semanas)
- **Qué da:** un *service worker* cachea la app y los últimos datos ya vistos. Permite
  **consultar** facturas/reportes previamente cargados e **imprimir** sin conexión.
- **No permite:** emitir ni cobrar offline.
- **Por qué es barato:** la base PWA (manifest) ya existe; falta el *service worker* y la
  estrategia de caché.
- **Mejor relación beneficio/costo** para arrancar.

### Nivel 3 — POS / captura offline con cola de sincronización (medio-alto, ~meses)
- **Qué da:** crear ventas y borradores **sin internet** (guardados localmente en el
  navegador, IndexedDB), con una **cola** que transmite a la DGII cuando vuelve la
  conexión (modo contingencia).
- **Qué implica:** reescribir la capa de datos del POS para que funcione en el cliente,
  construir el backend de sincronización, y resolver el **manejo de secuencias NCF
  offline** (riesgo de números duplicados si dos terminales trabajan desconectadas).
- Es la opción que probablemente resuelve la necesidad real del cliente (seguir
  facturando durante caídas de internet).

### Nivel 4 — App local en la red del negocio (alto, ~otro producto)
- **Qué da:** un servidor local (Electron/Tauri + Postgres local en la LAN del negocio)
  que opera todo el negocio offline y sincroniza a la nube + transmite a la DGII cuando
  hay internet.
- **Qué implica:** es prácticamente **reconstruir el producto** como aplicación de
  escritorio/local. Máximo alcance y máximo mantenimiento.

---

## Opción B — "Sin internet" = la impresora / la impresión

Es una lectura muy posible, y la respuesta es más tranquilizadora:

- **La impresión ya es local, no usa internet.** El botón de imprimir usa el diálogo del
  navegador → impresora del sistema operativo (USB o red local). La impresora **no** se
  conecta por internet. Lo único que hoy necesita internet es **cargar la página**.
- Por lo tanto:
  - Si el problema es *"la impresión depende de la nube"* → **no es así**; la impresión en
    sí es 100% local.
  - Si el problema es *"no puedo imprimir cuando se cae el internet"* → eso lo resuelve el
    **Nivel 2 (PWA con caché)**: una vez cacheada la vista, se imprime offline.
  - Si lo que se quiere es **impresión directa a impresora térmica sin diálogo** (tickets),
    eso es un tema aparte: requiere un **agente local de impresión** (tipo QZ Tray) o el
    driver del sistema operativo. Se puede investigar por separado si es la necesidad real.

---

## Qué hay que decidir (antes de estimar en serio)

La pregunta clave para el cliente / Alex:

> **¿"Sin internet" significa seguir facturando y cobrando durante las caídas de internet
> (POS offline + transmisión diferida a la DGII), o significa poder imprimir/consultar sin
> conexión?**

- Si es **imprimir/consultar** → Opción B + **Nivel 2**. Esfuerzo bajo, semanas.
- Si es **seguir operando/facturando** → **Nivel 3**, acotado al POS. Esfuerzo medio-alto,
  meses, con el detalle no menor de las secuencias NCF y la contingencia DGII.
- "Toda la app 100% offline" (**Nivel 4**) es reconstruir el producto; conviene descartarlo
  salvo que sea un requisito explícito e innegociable.

---

## Recomendación

1. **Desambiguar el alcance con el cliente** usando la pregunta de arriba. La mayoría de
   las veces "sin internet" en un negocio con caja significa *"que no se me pare la venta
   cuando se cae el internet"*, no *"que todo el sistema viva offline"*.
2. Si aplica, arrancar por el **Nivel 2 (PWA)** como paso incremental de bajo riesgo: da
   consulta e impresión offline y sienta la base técnica (service worker) para un eventual
   Nivel 3.
3. Tratar el **Nivel 3** como proyecto propio con su diseño de contingencia y secuencias.
