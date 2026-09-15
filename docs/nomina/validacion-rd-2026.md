# Validación base: contrato y deducciones RD — 2026-08-27

Alcance: contrato laboral privado ordinario dominicano y nómina mensual base.
No sustituye la revisión de un abogado laboralista ni cubre regímenes especiales
(trabajo doméstico, aprendizaje/pasantía, sector público, convenio colectivo o
empleados extranjeros).

## Contrato estructurado

El modelo sigue el artículo 24 del Código de Trabajo, Ley 16-92: identifica a
las partes y sus cédulas, describe servicio, horas y lugar, retribución/forma
de pago y modalidad. La Ley presume el contrato por tiempo indefinido; el
contrato temporal debe expresar su duración y el de obra/servicio su objeto.

La aplicación bloquea la emisión del **modelo estructurado** si faltan los
datos necesarios: identidad/residencia del trabajador, representante legal,
horario y lugar, y según corresponda fecha final u obra. Las plantillas de
texto libre continúan bajo responsabilidad de quien las redacte.

Se eliminó el período de prueba predeterminado: el artículo 80 de la Ley 16-92
regula auxilio de cesantía, no una facultad general de terminar sin
responsabilidad. No usar una cláusula de prueba sin dictamen laboral vigente.

Fuentes:

- Código de Trabajo, Ley 16-92, arts. 24 a 34 y 80: [Ministerio de Trabajo](https://mt.gob.do/transparencia/images/docs/publicaciones/codigo-de-trabajo.pdf).
- Art. 80 como auxilio de cesantía: [calculadora del Ministerio de Trabajo](https://calculo.mt.gob.do/Preview?Cedula=093-0066479-5).

## Deducciones y aportes que cubre el motor

| Concepto | Trabajador | Empleador | Estado en Vera |
| --- | ---: | ---: | --- |
| AFP / SVDS | 2.87% | 7.10% | Calculado, con tope de 20 SMC |
| SFS | 3.04% | 7.09% | Calculado, con tope de 10 SMC |
| SRL | — | 1.00% + 0.10–0.30% por riesgo | Tasa por empresa en Configuración (1.10–1.30%); vacía = 1.10% |
| INFOTEP, nómina ordinaria | — | 1% | Calculado sobre salario base; comisiones requieren incluirse en la base |
| ISR | Según escala anual | — | Calculado después de AFP/SFS del trabajador |
| Dependientes adicionales SFS | RD$1,919.78 c/u | — | Descontado según el registro del empleado (ver abajo) |

Para 2026 el SMC es RD$23,223; topes: AFP RD$464,460, SFS RD$232,230 y SRL
RD$92,892. La escala ISR 2026 mantiene exento hasta RD$416,220 anual.

**ISR 2027 (Ley 30-26, art. 10, promulgada el 18-jun-2026).** Desde el ejercicio
fiscal 2027: exento hasta RD$480,000; 15 % hasta RD$685,000; RD$30,750 + 20 %
hasta RD$910,000; RD$75,750 + 25 % hasta RD$4,800,000; RD$1,048,250 + 27 % en
adelante. Cargada como `TASAS_NOMINA_2027`; las corridas cuyo último día cae en
2027 la usan. La ley prevé indexar la escala cada año, así que 2028 necesita su
columna. La misma ley exime de ISR la regalía aunque pase de 5 salarios mínimos
(art. 33) y la asistencia económica del art. 82 del Código de Trabajo (art. 16).

Fuentes:

- Porcentajes AFP/SFS/SRL y base INFOTEP: [guía TSS](https://www.tss.gob.do/assets/faq0226-2024.pdf).
- SMC y topes 2026: [Resolución TSS 01-2025](https://www.tss.gob.do/assets/reso01-2025.pdf).
- Escala ISR 2026: [DGII](https://ayuda.dgii.gov.do/conversations/impuesto-sobre-la-renta-isr/ca687-cul-es-la-escala-salarial-correspondiente-al-ao-2026-del-impuesto-sobre-la-renta-isr/696a664277932619036537b8).
- Escala ISR 2027, Ley 30-26: la misma respuesta de la DGII (art. 10, desde el ejercicio 2027), [Alegra](https://blog.alegra.com/republica-dominicana/ley-30-26-en-republica-dominicana/) y [Siempre al Día](https://siemprealdia.co/republica-dominicana/impuestos/tabla-de-retencion-del-isr/).
- INFOTEP: 1% empresarial sobre sueldos y 0.5% del trabajador únicamente sobre utilidades/bonificaciones: [Ley 116-80, art. 24](https://www.infotep.gob.do/index.php/marco-legal/category/14-leyes?download=19%3Aley116).

## Límites conocidos antes de producción

- El 0.5% INFOTEP sobre utilidades/bonificaciones no está en el motor: Vera aún
  no modela ni paga bonificación anual. Debe implementarse junto con ese flujo;
  no corresponde descontarlo del salario ordinario.
- Horas extra, comisiones, incentivos, vacaciones y otras remuneraciones deben
  incorporarse a la base ISR del mes cuando apliquen. El motor actual calcula
  salario base mensual; esos conceptos necesitan su propio ingreso antes de
  declararse productivos.
- La tasa SRL se configura por empresa; si no se configura se usa 1.10%, que es
  el mínimo. Hay que tomarla de la notificación de pago de la TSS de la empresa.

## Dependientes adicionales, piso de cotización y SRL — 2026-09-13

**Dependientes del Seguro Familiar de Salud.** Los directos (cónyuge, hijos e
hijastros menores de 18, y de 18 a 21 si estudian) no cuestan. Los adicionales
(hijos o hijastros mayores de 18 que no estudian o de 21 en adelante, padres del
titular y padres del cónyuge) se afilian primero en la ARS y se registran en el
SUIR; por cada uno el trabajador paga RD$1,887.54 de per cápita + RD$32.24 de
FONAMAT = **RD$1,919.78 al mes** (Res. CNSS 624-02, vigente desde el
1-nov-2025). La TSS lo factura al empleador y este lo descuenta del salario.

- Se cobra lo **registrado** (`tipo`), no lo que diga la edad: es lo que factura
  la TSS. La regla por edad solo avisa en la ficha del empleado.
- La cápita va entera en la corrida mensual y a mitades en las quincenas; se
  suma a la obligación TSS y a su columna en la autodeterminación.
- **Dudoso:** el motor NO resta la cápita de la base del ISR. No se encontró
  fuente que la haga deducible; restarla sin fuente sería retener ISR de menos.
- La tarifa está versionada por fecha en `CAPITAS_DEPENDIENTE_ADICIONAL`.

**Piso de cotización.** La base de AFP, SFS y SRL no baja del salario mínimo del
sector de la empresa, salvo dispensa del CNSS (Res. 471-02), que se marca por
empleado. El ISR y el INFOTEP siguen sobre el salario real. La línea de la corrida
guarda la base usada (`salario_cotizable_cents`), que es la que reporta la
autodeterminación.

Salario mínimo del sector privado no sectorizado, Res. CNS-01-2025, desde el
1-feb-2026: micro RD$16,993.20 · pequeña RD$18,421.20 · mediana RD$27,489.60 ·
grande RD$29,988.00. El tramo anterior a esa fecha **no está cargado**: para
períodos anteriores no se aplica piso. Hoteles, zonas francas y demás sectores
con tarifa propia no deben configurar el tamaño hasta que se carguen sus tablas.

**SRL.** 1% fijo + 0.10–0.30% según el riesgo de la actividad; la tasa asignada
aparece en la notificación de pago de la TSS.

Fuentes:

- Dependientes adicionales, cápita vigente, salario cotizable y dispensa: [preguntas frecuentes de la TSS](https://tss.gob.do/preguntas-frecuentes/).
- Aumento de la cápita por el CNSS: [Diario Libre, 14-nov-2025](https://www.diariolibre.com/actualidad/salud/2025/11/14/cnss-dispone-alza-de-rd20432-en-capita-del-sfs-por-dependiente/3310773).
- Salario mínimo 2026 por tamaño de empresa: [alerta fiscal de EY](https://www.ey.com/es_ce/technical/tax/tax-alerts/republica-dominicana-salario-minimo-2026).
- Rango de la tasa SRL: [preguntas frecuentes de IDOPPRIL](https://idoppril.gob.do/preguntas-frecuentes-faqs/).

## Corridas por fechas (T1) — 2026-09-14

Cada corrida paga un **rango de fechas inclusivo** (`fecha_inicio` a `fecha_fin`)
y `periodo` queda como su mes contable. Tipos: `mensual` (el mes), `quincenal-1`
(1 al 15), `quincenal-2` (16 al último día) y `semanal` (7 días desde el primer día
elegido; su mes contable es el del último día). Regalía, bonificación y
liquidación siguen rechazadas hasta tener su propio cálculo.

- **A quién paga.** Solo a los empleados cuya frecuencia de pago coincide con el
  tipo. Antes el botón manual incluía a todos: una mensual le pagaba el mes entero
  a quien también cobraba por quincenas.
- **Días pagables.** Los días del rango entre la fecha de ingreso y la de salida,
  ambas incluidas y en días calendario. Quien está de baja sin fecha de salida no
  entra. «Dar de baja» pide el último día trabajado.
- **Mensual y quincenas.** Se calcula el mes que le toca al empleado: cada tramo
  del mes vale su parte del salario por los días trabajados en él. Topes, piso e
  ISR se aplican sobre lo devengado en el mes y el resultado se reparte entre los
  tramos según lo devengado en cada uno. Así quien entra el día 21 con RD$100,000
  gana RD$33,333.33 y queda exento de ISR, en vez de pagar un tercio del ISR de un
  mes completo. Las dos quincenas suman el mes al centavo.
- **Piso del mínimo en mes parcial.** Se prorratea por los días trabajados del mes.
  **Supuesto:** no se encontró fuente de la TSS para meses incompletos.
- **Semanal.** La semana completa vale el mes × 12 ÷ 52, con redondeo acumulado
  sobre las 52 semanas del año: las 52 suman el año exacto y cuatro seguidas se
  desvían del mes × 48 ÷ 52 como mucho un centavo. Topes, ISR y cápita se calculan
  sobre el mes y la semana se lleva su parte; en una semana incompleta eso retiene
  un poco de más de ISR, que corregirá el ISR acumulado (T4).
- **Duplicados.** No se crea una corrida de la misma frecuencia que se solape con
  otra existente (semanal del 3 cuando ya está la del 1, por ejemplo), y el índice
  único pasó a (`team_id`, `tipo`, `fecha_inicio`).

Límites conocidos:

- La autodeterminación TSS se sigue generando por corrida; con quincenas o semanas
  el archivo no es el mensual que pide la TSS (T10).
- La programación automática no genera corridas semanales.
- La política de días (calendario) no es configurable todavía.

## Nómina en contabilidad — 2026-09-14

Pedido de la reunión de integración: que la nómina alimente la contabilidad sola.
Cada hecho genera su asiento, con origen propio y candado único
(`team`, `origen_tipo`, `origen_id`), así que repetirlo no duplica:

| Hecho | Origen | Debe | Haber |
|---|---|---|---|
| Aprobar la corrida | `nomina` | 6104 Sueldos y salarios (bruto) · 6105 Aportes patronales (AFP + SFS + SRL + INFOTEP) | 2106 Retenciones TSS (AFP + SFS + dependientes) · 2108 ISR asalariados · 2107 Aportes TSS · 2109 INFOTEP · 2105 Sueldos por pagar (neto) |
| Provisiones (si se provisiona) | `provision_nomina` | 6106 Regalía · 6107 Vacaciones · 6108 Cesantía | 2110–2112 sus pasivos |
| Pagar sueldos | `pago_sueldos` | 2105 Sueldos por pagar | Caja o banco según el método |
| Pagar la TSS | `pago_nomina` | 2106 + 2107 + 2109 | Caja o banco |
| Pagar la DGII | `pago_nomina` | 2108 ISR | Caja o banco |

- Cada pasivo queda en cero cuando se paga lo suyo: TSS, DGII e INFOTEP se cobran
  por separado y el contador lo pidió así.
- Con la contabilidad apagada, pagar no falla: el documento queda **sin asentar**
  y el barrido lo asienta al encenderla (probado desde la UI).
- La forma de pago tiene que apuntar a una cuenta de **activo**. En la reunión se
  había mapeado a 3101 Capital social; la configuración ya no lo admite y la
  validación marca las que quedaron así.
- «Configuración recomendada» crea las cuentas base que falten (entre ellas
  2105–2112 y 6104–6108) y llena solo los campos vacíos, sin tocar lo elegido a
  mano. No enciende la contabilidad: eso sigue siendo decisión explícita.

## Provisiones por antigüedad y horario semanal — 2026-09-14

- **Cesantía (art. 80).** Lo que se provisiona en el período es lo que subió el
  derecho ganado entre su inicio y su fin: nada antes de 3 meses, 6 días a los 3,
  13 a los 6, 21 por año desde el primero y 23 por año desde los 5, sobre el
  salario diario (mensual ÷ 23.83). El mes en que alguien cumple 5 años salta.
- **Vacaciones (art. 177).** 14 días al año, 18 desde los 5 años; o los días
  pactados en la ficha si son más.
- **Regalía (art. 219).** 1/12 de lo devengado, con tope de 5 salarios mínimos al
  año.
- Cada línea guarda sus tres provisiones (`nomina_lineas.provision_*`). Las
  corridas anteriores a este cambio siguen con la estimación lineal y la pantalla
  lo dice.
- **Horario (art. 147).** `empleados.horario_semanal` guarda las horas de cada
  día. Avisa si pasa de 8 al día, de 44 a la semana (las de más son extra) o si
  no deja día libre. El valor de la hora es el salario × 12 ÷ 52 ÷ horas de la
  semana.

## Pago por horas — 2026-09-14

- Quien tiene jornada **Por horas** lleva una **tarifa por hora** en vez de
  salario, y la corrida le paga solo las **horas aprobadas** de sus fechas.
- **Clasificación (art. 203).** Las horas de cada semana (lunes a domingo) se
  acumulan por fecha: hasta 44 son ordinarias, de 44 a 68 extra al 35 % y desde
  68 al 100 %. La primera semana de una corrida cuenta también las horas previas
  de esa semana para el acumulado, sin pagarlas otra vez.
- **Nocturnas y feriados.** Recargo de 15 % a la hora nocturna (9 p. m. a 7 a. m.)
  y el feriado se paga doble. **Supuesto a confirmar con el contador:** una hora
  que es extra y feriado a la vez lleva los dos recargos.
- **TSS, ISR y piso.** Se calculan sobre el mes equivalente (lo del período × lo
  que cabe en un mes) y el período se lleva su parte, igual que el salario fijo.
  Quien trabaja pocas horas queda bajo el mínimo y cotiza sobre él salvo dispensa
  (Res. 471-02).
- **Enlace del empleado.** Desde Empleados se genera un enlace sin cuenta en
  Zero (solo se enseña una vez; en la base queda su SHA-256 y generar otro anula
  el anterior). El empleado sube una entrada por día, de hasta 45 días atrás, y
  ve si se aprobó o por qué se rechazó. No ve tarifa ni salario.
- **Revisión.** En Nómina › Horas se aprueba o se rechaza en lote; rechazar pide
  motivo. Lo que registra la empresa nace aprobado.
- **Corrida.** El detalle muestra «50 h a RD$250.00 en 6 días · 44 ordinarias ·
  6 extra al 35 % · …» y avisa si hay horas sin revisar en esas fechas. El
  volante dice «Pago por horas (…)».
- **Semana cerrada.** Una vez aprobada la corrida, el empleado ya no puede subir
  horas de esas fechas, y las pendientes que caen ahí salen marcadas: aprobarlas
  no las paga.

Probado de punta a punta en la UI (sandbox): alta con tarifa RD$250, enlace, seis
días subidos (uno rechazado y corregido), corrida semanal del 7 al 13 de
septiembre con RD$14,350.00 de bruto (44 ordinarias + 6 extra + 2 nocturnas +
5 de feriado), volante y bloqueo de la semana cerrada.

Límites conocidos:

- Las horas que llegan tarde a una corrida ya aprobada no tienen cómo pagarse
  todavía: hace falta el ajuste manual de conceptos (T3).
- Un borrador no se recalcula solo: si se aprueban horas después, se borra y se
  vuelve a generar (la pantalla lo indica).

## Módulo Contabilidad — 2026-09-14

- Contabilidad salió de Facturación a su propio módulo (`/contabilidad`), como
  Nómina. Es **módulo base**: viene en todos los planes y no se cobra; entra quien
  tenga `contabilidad:ver`, el mismo permiso de antes.
- Se mudaron catálogo, libro diario, nuevo asiento, mayor, balances, estado de
  resultados, activos fijos, cuentas por pagar, cierre y configuración. Los
  enlaces viejos (`/dashboard/contabilidad/...`) redirigen con 307 conservando la
  query. **Secuencias de comprobantes** y **Consulta de e-NCF** se quedaron en
  Facturación, en el grupo «Comprobantes»: son de la DGII y se usan facturando.
- **Panorama.** Por módulo (Facturación, Compras y gastos, Caja, Nómina, Activos
  fijos, manuales y cierre): asientos del mes, monto, último y documentos **sin
  asentar**, con enlace al libro diario filtrado por origen. Arriba, si el
  registro automático está encendido, si la configuración está completa, si el
  libro cuadra, y el botón para generar lo pendiente.

## Contribución por residuos sólidos — aclaración del audio

El término pendiente es la **Contribución Especial para la Gestión Integral de
Residuos Sólidos (CRS)**. No es una deducción de empleado, aporte TSS ni parte
del cálculo de nómina: es una obligación fiscal anual de la persona jurídica,
calculada por tramo de ingresos del ejercicio, aun si no tuvo beneficios.

Por tanto, **no debe entrar en `calcularNominaEmpleado` ni descontarse del
volante**. Su lugar futuro es Contabilidad/Obligaciones fiscales: registrar la
cuenta por pagar y el pago, conciliar contra la Oficina Virtual DGII y alertar
su vencimiento. La tarifa debe ser versionada por ejercicio y tomada de la
resolución DGII vigente, pues la Ley 98-25 prevé indexación anual.

La Ley 98-25 modificó el artículo 36 de la Ley 225-20 y fija la obligación para
el cierre fiscal 2025 en adelante. Para contribuyentes con cierre 31-dic-2025,
la DGII aplicó en 2026 dos cuotas automáticas de 50%: 30 de junio y 31 de
diciembre. Esta regla transitoria no se debe asumir para cierres posteriores sin
consultar la resolución vigente.

Fuentes: [Ley 98-25, art. 5](https://www.dgii.gov.do/legislacion/leyesTributarias/Documents/Leyes%20de%20Instituciones%20y%20Fondos%20de%20Terceros/98-25.pdf), [sujetos obligados DGII](https://ayuda.dgii.gov.do/conversations/ley-general-de-gestin-integral-y-coprocesamiento-de-residuos-de-la-repblica-dominicana/ca4556-quines-tienen-la-obligacin-de-pagar-la-contribucin-especial-para-la-gestin-integral-de-residuos-slidos/60999a344d23f459c4e4f35b), [fraccionamiento 2026 DGII](https://ayuda.dgii.gov.do/conversations/ley-general-de-gestin-integral-y-coprocesamiento-de-residuos-de-la-repblica-dominicana/ca5381-puedo-pagar-la-contribucin-especial-para-la-gestin-integral-de-residuos-slidos-de-manera-fraccionada/6a43b3b324898d6239f79383).
