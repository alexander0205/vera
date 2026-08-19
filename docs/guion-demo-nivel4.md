# Guión de demo — Nivel 4 de Contabilidad
### COLEGIO ANDRES BELLO · con datos ya cargados

> Guía para **probar y explicar a la vez** los módulos nuevos de contabilidad:
> activos fijos y depreciación, ITBIS de compras por régimen, cuentas por pagar
> y cierre de ejercicio. Las pantallas abren con datos sembrados, listas para
> mostrar a un cliente.

## Antes de empezar

- Entra y selecciona la empresa **COLEGIO ANDRES BELLO**. La contabilidad ya está encendida.
- Todo se maneja desde el menú **Contabilidad** (barra izquierda).
- **La regla que hay que entender primero:** el sistema no crea los asientos en el
  instante de comprar o facturar — los genera **de noche automáticamente**, o cuando
  pulsas un botón. Así, un problema contable nunca puede tumbar una factura ante la
  DGII. Por eso, después de cada acción vamos al **Libro diario** a "revelar" el asiento.

---

## Módulo 1 — Activos fijos y depreciación

**Explícalo así.** Un activo fijo es un bien caro que dura años: el edificio, un
autobús, el mobiliario. No es un gasto de una sola vez; su valor se va consumiendo
mes a mes. Ese desgaste es la **depreciación**, y se reparte parejo (**método
lineal**): la misma cuota cada mes = (costo − valor residual) ÷ vida útil en meses.
El sistema la calcula y la asienta solo.

**Lo que ya está cargado** — abre **Contabilidad → Activos fijos**:

| Activo | Costo | Vida útil | Cuota mensual | Acumulada | Valor en libros |
|---|---|---|---|---|---|
| Edificio principal | RD$5,000,000 | 20 años (240 m) | RD$20,833.33 | RD$624,999.90 | **RD$4,375,000.10** |
| Autobús escolar | RD$3,500,000 (residual 500k) | 10 años (120 m) | RD$25,000.00 | RD$325,000.00 | **RD$3,175,000.00** |
| Mobiliario de aulas | RD$800,000 | 5 años (60 m) | RD$13,333.33 | RD$79,999.98 | **RD$720,000.02** |

**Qué señalar (enseñar):**
- El **edificio** es justo el ejemplo del contador: RD$5MM a 20 años → RD$20,833.33 al mes.
- El **autobús** muestra el **valor residual**: no se deprecia todo, solo costo − residual
  (3,500,000 − 500,000), por eso la cuota es RD$25,000.
- La columna **Valor en libros** (costo − acumulada) es lo que el bien "vale hoy" en la
  contabilidad. Es lo que se mostrará en el balance, no el costo original.

**Demuéstralo en vivo (opcional):** pulsa **"Generar depreciaciones"**. Como ya están al
día, dirá **"Todo al día"** — sirve para explicar que el proceso es **idempotente**: puede
correr mil veces y nunca deprecia dos veces el mismo mes.

**Verifica el asiento.** **Contabilidad → Libro diario**, filtro **Origen = Depreciación**.
Cada mes un asiento:

| | Debe | Haber |
|---|---|---|
| 6103 Gasto por depreciación | cuota del mes | |
| 1202 Depreciación acumulada | | cuota del mes |

*Dato para enseñar:* **1202 es un "contra-activo"** (resta del activo). Por eso, aunque sea
cuenta de activo, se mueve al haber.

---

## Módulo 2 — ITBIS de las compras, según el tipo de negocio

**Explícalo así.** Al comprar mercancía te cobran ITBIS. Qué haces con él **depende del
negocio** (el punto exacto del contador):
- **Un colegio** vende servicios **exentos** → no puede recuperar ese ITBIS, así que
  **forma parte del costo**.
- **Una ferretería** vende gravado → el ITBIS pagado es un **crédito fiscal** que descuenta
  del ITBIS que cobra; va a una cuenta aparte (**1104 ITBIS adelantado**).

En ambos casos **la deuda con el proveedor es el total**; lo único que cambia es a dónde va
el ITBIS por dentro.

**Lo que ya está cargado (caso EXENTO, el correcto para el colegio).** Las compras sembradas
ya generaron sus asientos bajo régimen **Exento**. Míralo en **Libro diario → Origen =
Compra**: el costo completo entra a inventario.

| | Debe | Haber |
|---|---|---|
| 1105 Inventario | total de la compra | |
| 2101 Cuentas por pagar (o 1101 Caja si es contado) | | total |

**Demuéstralo en vivo — el contraste GRAVADO ("como una ferretería"):**
1. **Contabilidad → Configuración contable → sección "ITBIS de compras"** → cambia el
   **Régimen a Gravado**. Guarda.
2. Ve a **Compras → Registrar compra**: proveedor cualquiera, **crédito**, un producto tipo
   bien (ej. **"Material gastable"**), costo **1,000**, e **ITBIS de la compra = 180**.
   Guarda (total 1,180).
3. **Libro diario → "Generar asientos pendientes"** → filtra **Compra**. El nuevo asiento
   separa el ITBIS:

| | Debe | Haber |
|---|---|---|
| 1105 Inventario | 1,000.00 | |
| 1104 ITBIS adelantado | 180.00 | |
| 2101 Cuentas por pagar | | 1,180.00 |

4. **Deja de nuevo el régimen en Exento** (el colegio es exento).

*Para cerrar la idea:* la deuda (2101) es 1,180 en los dos casos. Exento → el ITBIS engorda
el inventario; gravado → el ITBIS se aparta como impuesto recuperable ante la DGII.

---

## Módulo 3 — Cuentas por pagar

**Explícalo así.** Es **el espejo de las cuentas por cobrar, pero al revés** (palabras del
contador): en vez de lo que te deben, es **lo que tú debes** a tus proveedores. Registras la
compra a crédito con su vencimiento y el sistema te dice cuánto debes, qué está por vencer y
qué ya venció, **agrupado por antigüedad**. Cuando pagas, el saldo baja.

**Lo que ya está cargado** — abre **Contabilidad → Cuentas por pagar**. Arriba: **Pendiente
RD$463,500 · Vencido RD$418,500 · 4 cuentas (3 vencidas)**. La lista:

| Proveedor | Total | Vence | Estado | Antigüedad |
|---|---|---|---|---|
| Librería Escolar Nacional | RD$45,000 | 20/08/2026 | Pendiente | **Por vencer** |
| Distribuidora de Alimentos del Este | RD$78,500 | 10/07/2026 | Pendiente | **1–30 días** |
| Servicios de Mantenimiento RD | saldo **RD$80,000** | 05/06/2026 | **Parcial** | **31–60 días** |
| Uniformes y Textiles SRL | RD$260,000 | 12/04/2026 | Pendiente | **90+ días** |

**Qué señalar (enseñar):**
- Prueba los **filtros de antigüedad** (Por vencer · 1–30 · 31–60 · 61–90 · 90+ días) y de
  **estado** (Vencidas / Al día). Cada botón recalcula los totales.
- **Servicios de Mantenimiento** es el caso de **pago parcial**: la compra era de RD$120,000,
  ya se abonaron RD$40,000, y por eso muestra **saldo RD$80,000** y estado **Parcial**.
- La compra de **Papelería Central (RD$18,000, al contado) NO aparece aquí** a propósito: al
  contado ya está pagada. *Esto enseña el contraste contado vs. crédito.*

**Demuéstralo en vivo — registrar un pago:**
1. Entra a una cuenta (ej. **Distribuidora**, RD$78,500) y **registra un pago** (parcial o
   total), método **Efectivo**, con fecha.
2. El **saldo baja** al instante; si pagas todo, pasa a **Pagada** y **sale** de la lista.

**Verifica el asiento.** **Libro diario → Origen = Pago a proveedor**:

| | Debe | Haber |
|---|---|---|
| 2101 Cuentas por pagar | monto pagado | |
| 1101 Caja (o el banco del método) | | monto pagado |

*Para cerrar la idea:* solo las compras **a crédito** crean cuenta por pagar. Una compra
**al contado** se asienta directo (Debe inventario / Haber caja) y nunca pasa por esta pantalla.

---

## Módulo 4 — Cierre de ejercicio (cierre anual)

**Explícalo así.** Al terminar el año hay que "cerrar los libros": las cuentas de resultado
— **ingresos, costos y gastos** — se ponen en cero y su saldo neto (la utilidad o la pérdida
del año) pasa a **Resultados acumulados**, dentro del patrimonio. Así el año nuevo arranca
limpio y la ganancia/pérdida queda registrada en el capital de la empresa. El sistema arma
ese asiento de cierre solo, y es **reversible**.

**Lo que ya está cargado.** La demo tiene actividad en 2024, 2025 y 2026. Abre
**Contabilidad → Cierre de ejercicio**.

**Pruébalo:**
1. En **"Cerrar un ejercicio"**, elige el año **2024** y pulsa **Previsualizar**.
2. Verás qué se va a cerrar y el resultado:
   - Cuenta que se cierra: **6103 Gasto por depreciación**.
   - **Pérdida del ejercicio 2024: RD$229,166.63.**

   *Momento para enseñar:* en 2024 el colegio **solo tuvo depreciación** (el edificio, desde
   febrero) y todavía no facturaba, así que el año cierra en **pérdida**. Es un ejemplo real
   de por qué un negocio nuevo puede cerrar su primer año en rojo.
3. Pulsa **Confirmar cierre de 2024**.

**Qué debes ver / cómo verificar:**
- En **"Ejercicios cerrados"** aparece **2024 · Pérdida RD$229,166.63**.
- **Libro diario → Origen = Cierre.** El asiento de cierre:

  | | Debe | Haber |
  |---|---|---|
  | 3102 Resultados acumulados | 229,166.63 | |
  | 6103 Gasto por depreciación | | 229,166.63 |

  (Se vacía el gasto contra Resultados acumulados. Si el año hubiera cerrado en utilidad,
  3102 iría al haber.)
- **Contabilidad → Estado de resultados** del año 2024: **sigue mostrando la pérdida** de
  RD$229,166.63, no cero. *Enséñalo:* el reporte del año **ignora a propósito** el asiento de
  cierre, para que siga reflejando lo que de verdad pasó en el año.
- **Contabilidad → Balance general:** el resultado ahora vive en **3102 Resultados
  acumulados** dentro del patrimonio, y el balance sigue cuadrando.

**La regla de la secuencia (pruébala):**
- Intenta previsualizar **2025** *antes* de cerrar 2024 → el sistema **lo bloquea**: *"Hay un
  ejercicio anterior sin cerrar. Cierra los años en orden."* Es la protección para que los
  resultados de un año no se cuelen en otro.
- Una vez cerrado 2024, **2025 se desbloquea** y puedes cerrarlo también.

**Reabrir (por si te equivocaste o quieres reiniciar la demo):** en la lista de ejercicios
cerrados, el más reciente tiene el botón **Reabrir**. Lo pulsas y el cierre se deshace: las
cuentas de resultado vuelven a su estado abierto. *Enséñalo como red de seguridad: cerrar el
año no es irreversible.*

**Para cerrar la idea:** el cierre es lo que convierte doce meses de operación en una sola
cifra —ganó o perdió— que se suma al patrimonio de la empresa. Con esto el ciclo contable
anual queda completo.

---

## Cierre — comprobar que todo es sólido

- **Todo asiento cuadra**: Debe = Haber, siempre. Si no cuadrara, el sistema **no lo guarda**.
- **Contabilidad → Balance de comprobación**: el total del Debe iguala al del Haber.
- **Nada se duplica**: volver a generar no crea copias.
- **Se genera solo**: depreciación, compras, pagos y (mensualmente) el resto corren
  automáticos cada noche; los botones son solo para "quiero verlo ahora".

---

## Notas para el operador (no para el cliente)

- Los datos de demo se siembran con `npx tsx scripts/seed-demo-nivel4.ts` (idempotente).
- Para reiniciar la parte sembrada (activos + compras + pagos): `npx tsx
  scripts/limpiar-demo-nivel4.ts`. Un ejercicio **cerrado** se deshace con el botón
  **Reabrir** de la pantalla de cierre.
- Si cambiaste el **régimen de ITBIS** a Gravado durante el Módulo 2, vuelve a dejarlo en
  **Exento** (el colegio es exento).
