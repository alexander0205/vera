# Nómina y contabilidad — tareas tras la reunión con Dolores

Fuente: transcripción "Configuración Contable y Nómina Empresarial" (sáb. 26-sep-2026), analizada del minuto 0:00 al 1:04. Lo posterior (1:13 en adelante) es audio ajeno a la reunión y se ignora.
Participantes: Dolores = contable/usuaria de otro sistema (P1); Alexander = equipo Vera, el que demuestra el sistema (P2); Lisandro = cliente, dueño de colegios (P3).
Rama: `feat/nomina-contabilidad-mejoras`. Estado revisado contra el código el 2026-10-09.

Leyenda: 🔴 pedido explícito y bloquea uso real · 🟠 pedido, importante · 🟡 mejora / a validar · ✅ ya existe (solo verificar o exponer)

---

## 0. Qué ya existe (no rehacer)

| Lo que dijo Dolores | Estado en código |
|---|---|
| Salario fijo por empleado, corrida mensual/quincenal sin variación | ✅ `empleados.salarioBaseCents`, `frecuenciaPago`, `lib/nomina/generar-corrida.ts`, cron `nomina_programacion` |
| Volante de pago con AFP, SFS, ISR, riesgos laborales | ✅ `lib/pdf/VolanteNominaPDF.tsx` (deducciones de ley + una línea "otras deducciones") |
| Reserva de regalía / vacaciones / cesantía (interna, no sale en volante) | ✅ `lib/nomina/provisiones.ts`, columnas `provision_*` en `nomina_lineas`, asiento si `provisionarNomina` |
| Pago por efectivo / transferencia / cheque | ✅ `nomina_pagos.metodo` y selector en `app/nomina/corridas/[id]/_page-client.tsx`. Pago parcial por línea (`nomina_lineas.pagada`) |
| Archivo de dispersión bancaria | ✅ `lib/nomina/dispersion.ts`, `formatos-banco.ts` |
| Cuentas contables de nómina configurables y asientos | ✅ `lib/contabilidad/config.ts`, `nomina-asientos.ts`, `app/contabilidad/configuracion` |
| Catálogo de cuentas con regalía por pagar, cesantía, nómina por pagar | ✅ `lib/contabilidad/catalogo-base.ts` |
| Importar empleados desde gobernanza del colegio | ✅ `lib/nomina/importar-escolar.ts` |
| Foto de factura de gasto → registro | ✅ módulo gastos |

> Aclaración: Dolores vio "solo pago por banco" en la demo; el método efectivo ya existe en nómina, falta que se vea y que **desmarcar empleados** sea obvio (ver 2.3).

---

## 1. Conceptos variables por empleado (ingresos y descuentos) 🔴

Hoy `otrasDeduccionesCents` entra al cálculo (`calculo.ts:132`) pero **ninguna pantalla ni tabla lo alimenta**; no hay forma de cargar un préstamo, avance, incentivo o bono. Es el pedido más fuerte de la reunión.

**Modelo (migración nueva, siguiente número tras `0184`)**
- [x] Tabla `nomina_conceptos` (catálogo por empresa): `tipo` ingreso|descuento, `codigo`, `nombre`, `cuentaId` (cuenta contable propia), `cotizaTss` bool, `gravaIsr` bool, `activo`.
  - Ingresos semilla: Salario, Incentivo, Comisión, Vacaciones pagadas, Horas extra, Otros ingresos (bono/gratificación).
  - Descuentos semilla: Cuenta por cobrar empleado (avance/préstamo), Seguro médico adicional, Daños/Rotura, Otros descuentos.
- [x] Tabla `empleado_conceptos` (asignación): `empleadoId`, `conceptoId`, `montoCents`, `fijo` bool, `desde`, `hasta`, `comentario`. Fijo = se repite cada corrida (incentivo fijo mensual); no fijo = una sola corrida.
- [x] Tabla `nomina_linea_conceptos` (snapshot por línea de corrida): concepto, monto, comentario. Así la historia no cambia si se edita la asignación.
- [x] Préstamos/avances: `empleado_prestamos` (monto total, cuota, saldo, cuotas restantes). Cada corrida descuenta la cuota y baja el saldo; al llegar a 0 se cierra. Dolores: "avance a sueldo / préstamo → cuentas por cobrar".

**Cálculo (`lib/nomina/calculo.ts`, `corrida.ts`)**
- [x] Sumar ingresos adicionales al bruto con flag de si cotizan TSS / gravan ISR (decisión legal: incentivos y comisiones sí cotizan y gravan; confirmar con el contable de Vera antes de fijar defaults).
- [x] Sustituir el `otrasDeduccionesCents` suelto por la suma de descuentos del empleado en ese período; el descuento nunca debe dejar el neto negativo (tope o aviso).
- [x] Tests (`tests/unit/nomina-conceptos.test.ts`): ampliar `tests/unit/nomina-calculo.test.ts` y `nomina-corrida.test.ts` (ingreso que cotiza, descuento tope, préstamo que se salda).

**Contabilidad (`nomina-asientos.ts`)**
- [x] Cada concepto asienta en **su** cuenta: ingresos → gasto (p. ej. incentivos), descuentos → cuenta por cobrar empleados (préstamo) o la cuenta que elija.
- [x] Config (panel «Ingresos y descuentos» en `nomina/configuracion`, una cuenta por concepto; no hay cuentas sueltas): `cuenta por cobrar a empleados`, `gasto incentivos`, `gasto comisiones`, `gasto vacaciones` en `contabilidad/configuracion` (Dolores: "a qué cuenta va vacaciones / tipos de incentivo").
- [x] Test de cuadre en `contabilidad-nomina-asientos.test.ts` con conceptos mezclados.

**UI**
- [x] Página «Ingresos y descuentos» (`empleados/[id]/conceptos`) en `app/nomina/empleados/[id]/` (ingresos y descuentos, fecha inicio/fin, fijo/no fijo, comentario).
- [~] En el borrador de corrida: hoy se ven los conceptos y la columna «Otros desc.»; para cambiarlos se ajusta la ficha, se borra el borrador y se regenera. Falta editar dentro del borrador.
- [x] API: `app/api/nomina/conceptos`, `.../empleados/[id]/conceptos`, `.../prestamos`.
- [x] Volante PDF: sección "Ingresos" con cada concepto y "Otros descuentos" desglosados con su comentario (hoy es una sola línea).

---

## 2. Corrida y pago 🟠

- [x] 2.1 **Volante** (descuentos en detalle ya estaban; los días trabajados por ausencias salen en «Salario del período (N de M días)») — mostrar descuentos en detalle (ver arriba) y, opcional, incluir dato de licencias/faltas cuando existan (Dolores: "a veces faltan… licencia, se le paga trabajado").
- [x] 2.2 **Faltas / licencias / días no trabajados** (hecho: tabla `nomina_ausencias`, migración 0190, página «Faltas y licencias» por empleado; falta y licencia sin pago restan días de pago, licencia con pago solo se anota; sin solapes; el volante ya muestra «N de M días». Pendiente: corrida en borrador no se recalcula sola al registrar una ausencia — se borra y se recrea. Quien cobra por horas no usa ausencias): hoy hay prorrateo por días (`proracion`) pero no un registro de ausencias. Diseñar `nomina_ausencias` (falta, licencia con/sin pago) que alimente `diasPagados`. 🟡 validar alcance con Dolores.
- [x] 2.3 **Pago selectivo efectivo vs. banco**: las casillas por línea ya existían (pago parcial). Faltaba que el archivo del banco las respetara y no repitiera a quien ya cobró: ahora `dispersion?lineas=…` limita el archivo a lo marcado, excluye a los ya pagados y el botón muestra cuántos van. Flujo: marcar los de banco → descargar archivo → «Marcar pagados» por transferencia; los demás se pagan en efectivo con la constancia.
- [x] 2.4 **Constancia de pago en efectivo**: `GET /api/nomina/corridas/[id]/constancia` (botón «Constancia de efectivo»): hoja imprimible con línea de firma por empleado pendiente o marcado, total y pie de recibido. Texto escapado y con CSP restrictiva.
- [x] 2.5 **Método de pago configurable en una sola vez** (hecho: panel «De dónde sale el pago» en `nomina/configuracion` con una caja por defecto para efectivo y un banco para transferencia o cheque; al pagar sueldos o TSS/DGII se puede elegir otra cuenta para ese pago. Orden: la elegida → la de por defecto de nómina → la del método, como antes. Migración 0186.)  Texto original: (Dolores: "se define desde configuración, así como el banco"): caja/banco de origen por defecto del pago de nómina, en `nomina/configuracion`.
- [x] 2.6 **Vacaciones como costo de la empresa**: registrar pago de vacaciones (ingreso "Vacaciones" del punto 1) y que consuma la reserva de `provision_vacaciones`. Hoy solo se provisiona. ✅ regalía y vacaciones consumen la reserva (commit 8f642e51)
- [x] 2.7 **Regalía pascual**: pantalla/corrida de diciembre que pague la regalía y salde la reserva acumulada (hoy solo se provisiona; no hay corrida tipo regalía). Verificar topes (`topeRegaliaAnualCents`). ✅ corrida tipo regalía pascual (commit 8f642e51)
- [x] 2.8 **Salida de empleado / liquidación**: preaviso + cesantía + vacaciones no tomadas + regalía proporcional ("si ya un empleado sale de la empresa…"). Existe `diasCesantiaGanados`; falta el cálculo y el documento completo. 🟡 ✅ liquidación de empleados (commit 44a883f6)

## 3. Importación de empleados 🟠

- [x] 3.1 (hecho — ver `docs/nomina-importar-empleados-pruebas.md`: plantilla descargable con los empleados, vista previa, todo o nada, llave = cédula, incentivo fijo incluido; falta pedirle a Lisandro el Excel con salarios) Cargar el Excel de empleados que Lisandro ya tiene (salarios, incentivos fijos, cuenta de banco). Plantilla Excel + importador masivo `app/api/nomina/empleados/importar`. El de escolar (`importar-escolar`) trae empleados pero **no salarios** (gobernanza no los guarda) — hay que pedir el Excel de salarios.
- [ ] 3.2 Tras Darián cerrar estudiantes/costos/facturas en gobernanza (panorama hoy en cero), importar personal desde SIGERD y completar salarios con el Excel.
- [ ] 3.3 Detectar si un empleado ya trabaja en otro colegio (Dolores lo mencionó en SIGERD; fuera de alcance de Vera, solo anotar).

---

## 4. Contabilidad / egresos 🟠

- [x] 4.1 **Efectivo y caja como forma de pago de gastos/facturas de proveedor**: hoy salen efectivo/tarjeta/transferencia; Dolores pide que el catálogo defina las cuentas de pago configurables (Banco BHD, Caja general, Caja chica, Tarjeta de crédito X) y se pueda **mixto**. Hacer la lista dinámica ("cuentas de pago") amarrada a cuentas del catálogo en vez de fija. ✅ cuentas de pago dinámicas (commit 8587d63d)
- [x] 4.2 **Cuentas de pago configurables**: `cuentas_pago` por empresa (nombre, tipo caja|banco|tarjeta, cuenta contable, número). Prerrequisito de 4.3–4.6. ✅ cuentas de pago por empresa
- [x] 4.3 **Cargos bancarios** (comisión mensual, 0.15 %/0.20 % por débito) como movimiento propio que asienta en gasto bancario. ✅ cargos bancarios (commit c931db38)
- [x] 4.4 **Transferencias entre cuentas propias** (banco→banco, caja→banco) sin tocar gasto ni ingreso. Distinguir de transferencia a tercero (pago a proveedor). ✅ transferencias entre cuentas propias (c931db38)
- [x] 4.5 **Libro banco**: reporte por cuenta y rango de fechas, separado por depósitos/transferencias/retiros y consolidado; imprimible. Dolores concilia a mano con esto. ✅ libro banco (c931db38)
- [x] 4.6 **Conciliación bancaria**: marcar movimiento conciliado vs estado del banco; listar partidas pendientes. Caso real de Dolores: depósitos de padres sin concepto ni factura que hay que identificar después → estado "depósito sin identificar" que luego se asigna a un cliente/cargo. Fase posterior; empezar por 4.5. Los registros son manuales (sin conexión directa al banco). ✅ conciliación bancaria (c931db38)
- [x] 4.6b **Pago mixto** en gastos y facturas de proveedor (parte efectivo + parte transferencia/tarjeta), con cada parte a su cuenta de pago. Dolores lo exigió. ✅ pago mixto en compras (8587d63d)
- [x] 4.6c **Caja general vs. caja chica**: pagos menores salen de caja chica, los grandes de caja general; ambas deben poder elegirse como cuenta de pago. Hoy solo hay caja general. ✅ caja general y caja chica como cuentas de pago
- [x] 4.7 **Reporte de pagos en efectivo por rango** (Dolores lo pide: "cuánto he pagado en efectivo en agosto"). ✅ reporte de efectivo por rango (c931db38)
- [x] 4.8 **Gastos de beneficio al empleado** (almuerzo, atención): cuenta de gasto "atención al empleado" ubicada en el grupo de gastos de personal; no pasa por nómina. Añadir al catálogo base y a categorías de gasto. ✅ atención al empleado en catálogo y categorías (8587d63d)
- [x] 4.9 **Importar catálogo de cuentas por Excel** (Dolores/contable lo ofrece): plantilla + importador en `app/contabilidad/cuentas`; exportar también. Pedir su archivo. ✅ importar/exportar catálogo por Excel
- [ ] 4.10 **Solicitud de pago a proveedores + aprobación** (flujo: secretaria arma lista de pagos de la quincena, dueño aprueba según saldo disponible). Requiere roles y estado `solicitado→aprobado→pagado`. 🟡 Dolores ni lo usa; baja prioridad.
- [ ] 4.11 **Escaneo de factura de gasto** reparte contra ítems/bien-servicio y cuenta contable. Hoy toma foto y llena datos del proveedor; falta la distribución por cuenta. 🟡 (Lisandro la dio por limitada.)
- [x] 4.12 **Filtrar el catálogo de bienes/servicios DGII** en la factura de gasto ("que se vea más fácil de buscar"). ✅ selector buscable de cuenta por categoría (ad375940)
- [x] 4.13 **Compras vs. gastos** (materiales de operación → compra/costo; combustible → gasto): revisar que el registro deje elegir y asiente en la cuenta correcta; añadir ayuda en pantalla. ✅ ayuda compra vs gasto en pantalla (ad375940)

## 5. Cobros del colegio (puente con gobernanza) 🟡

- [x] 5.1 Reporte mensual para el contable: cobrado por tarjeta / transferencia / efectivo, pendiente y pagos parciales, por mes. Dolores lo pide cada mes hoy por correo. Verificar que `administracion-escolar/dashboard.ts` + filtros por mes/concepto/grado (commit c3937825) lo cubren y exportan a Excel. ✅ Excel mensual del colegio, botón «Excel del mes» en el panorama (e638fe62)
- [x] 5.2 Cuentas por cobrar de un mes que pasan al siguiente: confirmar que el reporte del mes no mezcla saldos viejos. ✅ el Excel separa «Meses anteriores» de lo del mes
- [ ] 5.3 Accesos: crear usuario a Dolores en el sistema (pidió correo; lo hace Lisandro/Vera).

---

## 5b. Compromisos de seguimiento (no son código)

- [ ] Alexander/Vera: generar acceso a Dolores (necesita su correo).
- [ ] Vera: pedir a Lisandro el Excel de empleados con salarios, incentivos y fechas de vacaciones (el export de SIGERD no trae salarios; ver 3.1).
- [ ] Vera: pedir a Dolores su catálogo de cuentas en Excel (ver 4.9).
- [ ] Vera: sentar al contable de Vera con Dolores para validar requisitos de nómina y banco antes de construir 4.x.
- [ ] Darián: terminar gobernanza del colegio (estudiantes, costos, facturas) para que el panorama deje de estar en cero; después empleados.
- [ ] Lisandro: obtener certificado digital en la DGII para facturación electrónica.

## 6. Orden de ejecución sugerido

1. **Fase A (bloquea nómina real):** punto 1 completo (conceptos, préstamos, asientos, volante) → 2.3 → 2.5.
2. **Fase B:** 3.1 importador de empleados → 2.6 / 2.7 (vacaciones y regalía pagadas).
3. **Fase C (banco/contabilidad):** 4.2 → 4.1 → 4.4 → 4.3 → 4.5 → 4.7 → 4.8 → 4.9.
4. **Fase D:** 4.6 conciliación, 2.2 ausencias, 2.8 liquidación, 4.10 solicitud de pago.

## 7. Preguntas abiertas (resolver con el contable de Vera / Dolores)

1. ¿Incentivos fijos, comisiones y bonos cotizan TSS y gravan ISR en el tratamiento que ellos aplican? (define flags por defecto del catálogo)
2. ¿Préstamos a empleados: tope de descuento por corrida? ¿Interés?
3. ¿Cuál es el catálogo de cuentas que Dolores quiere usar? (pedir Excel)
4. ¿Pago en efectivo de nómina sale de "Caja general" o de "Caja chica"?
5. ¿Faltas/licencias: las registra RR.HH. o se calculan por días? ¿Hay licencias pagadas por la TSS?
6. Excel de empleados con salarios e incentivos de Lisandro (necesario para 3.1).


## Despliegue

Migraciones 0185–0190 solo aplicadas en local: hay que correrlas en producción antes de desplegar (0185 conceptos, 0186 cuenta de pago, 0187 conciliación, 0188 pago mixto, 0189 liquidaciones, 0190 ausencias).
