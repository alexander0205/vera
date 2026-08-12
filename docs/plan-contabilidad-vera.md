# Plan para integrar entorno contable en Vera

> **Reconciliado contra main el 2026-07-20** (main en v1.5.0, ya mergeado a
> `feature/administracion-escolar`). Ver "Estado tras el merge de main" abajo:
> hay una **colision de nombre** que decidir antes de empezar el Paso 2.

## Estado tras el merge de main (2026-07-20)

Main incorporo un modulo llamado **Contabilidad** mientras este plan estaba
escrito. **NO es el motor contable que describe este documento.** Lo que llego es
trazabilidad fiscal de e-NCF:

| Lo que llego en main | Que hace | Archivos |
|---|---|---|
| Contabilidad → Secuencias | Rangos de e-NCF configurados: usados, disponibles, % consumido, vencimiento, alerta por agotarse | `app/(dashboard)/dashboard/contabilidad/secuencias/`, `lib/contabilidad/secuencias.ts` |
| Contabilidad → Consulta de e-NCF | Cruza 3 fuentes (`ecf_documents` local, ecf-api del proveedor, DGII) para responder "que paso con el E31…044" | `contabilidad/consulta-ncf/`, `app/api/contabilidad/consulta-ncf/route.ts` |
| Taxonomia de estados | 10 estados de e-NCF con veredicto para el contador (`declarar` / `no-declarar` / `esperar` / `revisar`), en lenguaje de contabilidad | `lib/contabilidad/estados.ts` |

Verificado en el schema: **no existe ninguna tabla de asientos, catalogo de
cuentas ni libro diario**. Los Pasos 2 al 6 de este plan siguen enteramente sin
implementar. Lo de main resuelve declaracion fiscal (607/608), no partida doble.

### Decision pendiente: colision de nombre

El slot de navegacion "Contabilidad" ya esta ocupado por el modulo fiscal. Antes
de arrancar el Paso 2 hay que decidir una de estas:

1. **Convivir bajo el mismo grupo**: agregar Catalogo de cuentas, Asientos,
   Libro diario, etc. como hijos del grupo "Contabilidad" existente, junto a
   Secuencias y Consulta de e-NCF. Es lo mas simple y lo que menos confunde al
   usuario, que no distingue "fiscal" de "contable".
2. **Separar los grupos**: renombrar lo de main a "Comprobantes fiscales" o
   "e-NCF" y reservar "Contabilidad" para el motor de asientos. Mas correcto
   conceptualmente, pero toca codigo de main que no es de esta rama.

Recomendacion: opcion 1. Menos friccion con main y el usuario final busca todo
lo fiscal-contable en el mismo sitio.

### Detalle a corregir antes de construir encima

- El grupo "Contabilidad" de main **no tiene permiso propio** en
  `lib/config/roles.ts` — a diferencia de Administracion Escolar, que si esta
  gateada. Cualquier usuario con acceso al dashboard ve Secuencias y Consulta de
  e-NCF. Al agregar asientos y reportes contables (datos sensibles) hace falta
  definir el permiso, y conviene aprovechar y gatear tambien lo que ya esta.
- `getCuentasPorCobrar` (`lib/db/queries.ts`) gano parametros `limit`/`offset`
  en el merge, pero **la ruta `/api/cuentas-por-cobrar` no los pasa**: carga
  hasta el tope de 2000 y la tabla pagina en cliente. Relevante para el Paso 1,
  donde la priorizacion de cartera deberia ordenar y paginar en servidor.

## Nota de alcance

El flujo completo descrito previamente asume que los 6 pasos ya fueron implementados. En la practica, conviene avanzar por etapas: primero fortalecer cuentas por cobrar, luego agregar la capa contable automatica encima.

Administracion Escolar ya agrega un origen operativo de deuda: los cargos escolares se relacionan con estudiante, matricula, periodo, concepto y factura. El cargo conserva el contexto academico; la factura, sus pagos y sus notas siguen siendo los documentos que generan movimientos contables.

## Punto de partida recomendado

Empezar por cuentas por cobrar, pero no como modulo nuevo.

Motivo: Vera ya tiene una base solida de cuentas por cobrar: facturas con saldo, pagos recibidos, pagos divididos, mora, notas de credito, cuentas historicas, filtros, agrupacion por cliente y totales. Por eso el primer paso no debe ser "crear cuentas por cobrar", sino convertir lo existente en una estacion de gestion de cartera: priorizar que cobrar, entender el historial de cada deuda, registrar seguimiento y preparar la informacion que luego usara la contabilidad automatica.

## Paso 1: Fortalecer cartera y trazabilidad de cobros

Objetivo: transformar la vista actual de cuentas por cobrar en una pantalla de gestion diaria: quien debe, cuanto debe, que tan urgente es, que se ha hecho para cobrar y cual es el proximo paso.

### Lo que Vera ya tiene

- Listado de cuentas por cobrar con saldo pendiente.
- Totales de pendiente, vencido, cantidad de cuentas y vencidas.
- Busqueda por cliente o RNC.
- Filtros por facturas, notas de debito por mora, vencidas y al dia.
- Agrupacion por cliente.
- Registro de pagos desde la cuenta por cobrar.
- Pagos divididos por metodo.
- Uso de notas de credito como pago.
- Mora incluida dentro del saldo combinado.
- Cuentas historicas para facturas previas al uso del sistema.
- Cargos escolares vinculables a factura, con estudiante, matricula, periodo y concepto de pago.
- Facturacion recurrente por matricula para mensualidades y cobro registrado en el ledger normal de facturas.
- Deep-link `?pagar=<docId>` en cuentas por cobrar: otro modulo (p. ej. un cargo escolar) abre directo el modal de cobro de esa factura.

Sumado en el merge de main del 2026-07-20:

- Links de pago con CardNet y Azul (`payment_provider_config`, `payment_links`): el cliente puede pagar una factura o cotizacion en linea. **Es un metodo de cobro nuevo que el Paso 3 tiene que mapear a una cuenta contable.**
- Trazabilidad de e-NCF y estado de secuencias (ver "Estado tras el merge de main").
- Guard de turno de caja con limite configurable (`teams.caja_limite_horas`, `caja_aviso_minutos`, `caja_gracia_horas`): pasado el limite no se puede facturar ni cobrar hasta cerrar caja.
- Indices de performance sobre `ecf_documents`, `clients`, `pagos_recibidos`, `dependientes` y padron RNC — los reportes contables del Paso 6 se apoyan en ellos.

### Lo nuevo que se implementaria en este paso

- Priorizacion de cobros para ordenar la cartera por urgencia, monto, vencimiento o promesa incumplida.
- Antiguedad de saldos vencidos por rangos: 1-30, 31-60, 61-90 y mas de 90 dias.
- Panel lateral de detalle para revisar una cuenta sin salir de la lista.
- Timeline visible de eventos: factura emitida, pago recibido, mora generada, nota aplicada y contacto realizado.
- Seguimiento de cobranza por cuenta: ultimo contacto, responsable, proxima accion y comentario interno.
- Promesas de pago con fecha comprometida y estado de cumplimiento.
- Recordatorios individuales y masivos para cuentas vencidas o proximas a vencer.
- Notas internas de cobranza separadas de las notas fiscales o comerciales de la factura.
- Metricas nuevas como "por vencer", "promesas de pago" y "promesas incumplidas".

Subpasos:

1. Confirmar y documentar la logica actual de saldo.
   - Total de factura.
   - Pagos registrados.
   - Notas de credito aplicadas.
   - Saldo a favor usado.
   - Mora pendiente.
   - Estado de pago: pendiente, parcial, pagada, anulada.
   - Diferencia entre saldo de factura y saldo combinado con mora.

2. Mantener reglas claras de inclusion.
   - Facturas pendientes o parciales aparecen en cuentas por cobrar.
   - Facturas pagadas no aparecen.
   - Facturas anuladas o rechazadas no deben cobrarse.
   - Notas de credito no son cuentas por cobrar.
   - Notas de debito por mora se muestran agrupadas con la factura origen.

3. Agregar priorizacion de cartera.
   - Mostrar "por vencer" para prevenir vencimientos.
   - Separar vencido por rangos: 1-30, 31-60, 61-90 y mas de 90 dias.
   - Identificar clientes con mayor saldo pendiente.
   - Resaltar cuentas con mora.
   - Ordenar por urgencia: vencidas primero, luego por monto y fecha.

4. Agregar panel de detalle sin salir de la lista.
   - Resumen de factura.
   - Historial de pagos.
   - Notas de credito aplicadas.
   - Mora generada.
   - Saldo actual.
   - Acciones rapidas: registrar pago, ver factura, aplicar nota, enviar recordatorio.

5. Agregar seguimiento de cobranza.
   - Ultimo contacto con el cliente.
   - Proxima accion: llamar, enviar correo, esperar promesa de pago.
   - Fecha prometida de pago.
   - Responsable interno del seguimiento.
   - Comentarios internos de cobranza.

6. Mejorar acciones de trabajo.
   - Exportar cartera.
   - Enviar recordatorio individual.
   - Enviar recordatorios masivos a vencidas.
   - Crear nota de seguimiento.
   - Registrar promesa de pago.

7. Validar casos reales.
   - Pago parcial.
   - Pago dividido.
   - Factura vencida.
   - Factura con nota de credito.
   - Factura con mora.
   - Factura de contado no pagada.
   - Cliente con varias facturas.
   - Cliente con promesa de pago incumplida.

8. Dejar trazabilidad.
   - Quien registro el pago.
   - Fecha real del pago.
   - Metodo de pago.
   - Cuenta/caja/banco.
   - Referencia.
   - Quien hizo seguimiento de cobro.
   - Que mensaje se envio.
- Que respuesta dio el cliente.
   - Cuando aplique, estudiante, matricula, periodo y concepto escolar que originaron la deuda.

Resultado esperado: Vera puede responder con confianza "quien me debe, cuanto, desde cuando, que se ha intentado para cobrar, cual es el proximo paso y que impacto tendra en caja".

## Paso 2: Crear catalogo de cuentas

Objetivo: crear las cuentas contables base que luego recibiran los movimientos automaticos.

Subpasos:

1. Crear estructura de catalogo.
   - Codigo de cuenta.
   - Nombre.
   - Tipo: activo, pasivo, ingreso, gasto, patrimonio, costo.
   - Estado: activa/inactiva.
   - Cuenta padre para jerarquia.

2. Definir catalogo base para nuevas empresas.
   - Caja.
   - Bancos.
   - Cuentas por cobrar.
   - Ingresos por ventas.
   - ITBIS por pagar.
   - Retenciones.
   - Descuentos/devoluciones.
   - Mora.

3. Permitir personalizacion.
   - Crear cuentas.
   - Editar nombre.
   - Desactivar cuentas.
   - Mantener codigos estables.

4. Proteger cuentas usadas.
   - No eliminar cuentas con movimientos.
   - Permitir solo desactivarlas.

Resultado esperado: cada empresa tiene un mapa contable minimo para clasificar sus operaciones.

## Paso 3: Configurar cuentas automaticas por empresa

Objetivo: permitir que Vera sepa que cuenta usar sin preguntarle al usuario en cada factura.

Subpasos:

1. Crear configuracion contable general.
   - Cuenta por cobrar por defecto.
   - Cuenta de ITBIS por pagar.
   - Cuenta de ingresos por defecto.
   - Cuenta para descuentos/notas de credito.
   - Cuenta para mora.

2. Configurar cuentas por metodo de pago.
   - Efectivo -> Caja.
   - Transferencia -> Banco.
   - Tarjeta -> Banco/pasarela.
   - Cheque -> Cheques por depositar o banco.
   - Deposito -> Banco.
   - Link de pago CardNet/Azul -> cuenta de la pasarela. Ojo: el dinero no entra
     directo al banco, la pasarela liquida despues y retiene comision. Modelar
     como cuenta puente ("Cobros por liquidar") mas un gasto por comision, no
     como banco directo.

3. Configurar cuentas por producto, servicio o categoria.
   - Producto fisico -> Ingresos por venta de mercancia.
   - Servicio -> Ingresos por servicios.
   - Mora -> Ingresos por mora.

4. Validar configuracion incompleta.
   - Alertar antes de generar asientos.
   - Permitir modo "sin contabilidad" hasta completar configuracion.

Resultado esperado: Vera puede traducir documentos y pagos a cuentas contables automaticamente.

## Paso 4: Generar asientos para facturas y pagos

Objetivo: crear asientos contables automaticos desde operaciones normales.

Subpasos:

1. Crear tablas de asientos.
   - Encabezado: fecha, concepto, origen, documento, usuario, empresa.
   - Lineas: cuenta, debito, credito, descripcion.

2. Generar asiento de factura.
   - Debito a cuentas por cobrar.
   - Credito a ingresos.
   - Credito a ITBIS por pagar.

3. Generar asiento de pago.
   - Debito a caja/banco/metodo de pago.
   - Credito a cuentas por cobrar.

4. Asegurar cuadre.
   - Total debitos igual a total creditos.
   - No guardar asientos descuadrados.

5. Relacionar asiento con origen.
   - Factura.
   - Pago.
   - Nota.
   - Anulacion.
   - Cargo escolar y matricula, como referencias de trazabilidad sin duplicar el asiento.

6. Mantener una sola fuente monetaria.
   - Un cargo escolar sin factura no genera asiento.
   - Cuando el cargo se vincula a una factura, la factura genera el asiento de ingreso/cuenta por cobrar.
   - El pago se registra una sola vez en el ledger de facturacion y genera un unico asiento de cobro.

Resultado esperado: el usuario factura y cobra normalmente; Vera crea la contabilidad detras.

## Paso 5: Agregar notas, anulaciones, mora, retenciones y saldos a favor

Objetivo: cubrir los casos reales que complican la cartera y la contabilidad.

Subpasos:

1. Notas de credito.
   - Reducir cuenta por cobrar.
   - Registrar devolucion/descuento.
   - Ajustar ITBIS si aplica.
   - Crear saldo a favor cuando corresponda.

2. Notas de debito y mora.
   - Aumentar cuenta por cobrar.
   - Registrar ingreso por mora.
   - Mantener relacion con factura origen.

3. Anulaciones.
   - Crear asiento reverso.
   - No borrar historial.

4. Retenciones.
   - Separar lo cobrado en banco de lo retenido por el cliente.
   - Registrar retenciones por cobrar o credito fiscal segun aplique.

5. Saldos a favor.
   - Registrar origen del credito.
   - Aplicarlo a futuras facturas.
   - Mantener saldo disponible por cliente.

Resultado esperado: Vera maneja los casos especiales sin que el usuario tenga que cuadrarlos manualmente.

## Paso 6: Reportes contables

Objetivo: convertir los asientos en informacion contable util.

Subpasos:

1. Libro diario.
   - Lista cronologica de asientos.
   - Filtros por fecha, origen y cuenta.

2. Mayor general.
   - Movimientos por cuenta.
   - Saldo inicial, debitos, creditos y saldo final.

3. Balance de comprobacion.
   - Todas las cuentas con sus saldos.
   - Validacion de cuadre.

4. Estado de resultados basico.
   - Ingresos.
   - Costos.
   - Gastos.
   - Resultado neto.

5. Reportes de cartera.
   - Cuentas por cobrar por antiguedad.
   - Clientes vencidos.
   - Cobros por periodo.
   - Filtros escolares por periodo, curso, estudiante y concepto cuando el documento tenga origen escolar.

6. Exportaciones.
   - CSV/Excel.
   - PDF para contador.

Resultado esperado: Vera no solo emite facturas; tambien permite analizar la salud financiera de la empresa.

## Estrategia de rama y migraciones

Como contabilidad toca facturas, pagos, caja, reportes y ahora flujos de Administracion Escolar, debe desarrollarse en una rama independiente basada en el estado actual de Administracion Escolar.

Recomendacion:

```text
feature/administracion-escolar
  └── contabilidad-asientos-reportes
```

Motivo:

- Administracion Escolar ya integra cargos, matriculas, facturacion recurrente y cobros mediante el ledger de facturas.
- Contabilidad podra conservar el origen escolar de una factura o pago sin crear un segundo sistema de cobro o de asientos.
- POS cafeteria no es prerequisito de esta funcionalidad; sus futuras operaciones podran conectarse al mismo motor contable mediante sus propios origenes.
- El PR contable queda aislado de POS y debe rebasarse contra la rama destino que absorba Administracion Escolar.

Orden sugerido de integracion:

```text
Administracion Escolar
        ↓
contabilidad
        ↓
POS e inventario (integracion posterior)
```

Migraciones:

- **El tope ya no es 0077.** Tras el merge de main del 2026-07-20 las migraciones
  escolares se renumeraron de `0070-0077` a `0074-0081`, porque main habia
  ocupado `0070-0073` (`perf_indexes`, `dependientes_search_indexes`,
  `caja_limite_horas`, `payment_links`). La secuencia va limpia hasta **0081**,
  asi que el primer numero libre es **0082**.
- Reservar los numeros definitivos al integrar con la rama destino y revisar colisiones con migraciones paralelas.
- Nombrar las migraciones de forma clara, por ejemplo:

```text
0082_contabilidad_catalogo_cuentas.sql
0083_contabilidad_asientos.sql
0084_contabilidad_reportes.sql
```

**Leccion de las dos colisiones ya ocurridas** (2026-07-08 y 2026-07-20): esta
rama choco numeracion con main dos veces, y las dos veces hubo que correr los
archivos. Asumir que va a pasar de nuevo. Mitigaciones:

- Renombrar siempre en orden **descendente** (el mas alto primero) para no pisar
  archivos propios en el camino.
- Al renombrar una migracion hay que mover tambien su `scripts/apply-migration-XXXX.ts`
  y actualizar la ruta del `.sql` y el mensaje de log **dentro** del script.
- Mergear main seguido en vez de acumular 50 commits: el costo del renombrado
  crece con cada migracion nueva que se agregue encima.
- Migraciones con `CREATE INDEX CONCURRENTLY` no corren dentro de transaccion, y
  `postgres.js` envuelve el multi-statement en una implicita: hay que partir el
  archivo por `;` y ejecutar sentencia a sentencia.

Nota: si la rama destino cambia antes de terminar, rebasear o mergear con cuidado antes de cerrar el PR para evitar choques de schema.
