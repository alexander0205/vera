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
| SRL | — | 1.00% + 0.10–0.30% por riesgo | Calcula 1.10%: mínimo con riesgo bajo; empresa debe configurar su tasa real si es mayor |
| INFOTEP, nómina ordinaria | — | 1% | Calculado sobre salario base; comisiones requieren incluirse en la base |
| ISR | Según escala anual | — | Calculado después de AFP/SFS del trabajador |

Para 2026 el SMC es RD$23,223; topes: AFP RD$464,460, SFS RD$232,230 y SRL
RD$92,892. La escala ISR 2026 mantiene exento hasta RD$416,220 anual.

Fuentes:

- Porcentajes AFP/SFS/SRL y base INFOTEP: [guía TSS](https://www.tss.gob.do/assets/faq0226-2024.pdf).
- SMC y topes 2026: [Resolución TSS 01-2025](https://www.tss.gob.do/assets/reso01-2025.pdf).
- Escala ISR 2026: [DGII](https://ayuda.dgii.gov.do/conversations/impuesto-sobre-la-renta-isr/ca687-cul-es-la-escala-salarial-correspondiente-al-ao-2026-del-impuesto-sobre-la-renta-isr/696a664277932619036537b8).
- INFOTEP: 1% empresarial sobre sueldos y 0.5% del trabajador únicamente sobre utilidades/bonificaciones: [Ley 116-80, art. 24](https://www.infotep.gob.do/index.php/marco-legal/category/14-leyes?download=19%3Aley116).

## Límites conocidos antes de producción

- El 0.5% INFOTEP sobre utilidades/bonificaciones no está en el motor: Vera aún
  no modela ni paga bonificación anual. Debe implementarse junto con ese flujo;
  no corresponde descontarlo del salario ordinario.
- Horas extra, comisiones, incentivos, vacaciones y otras remuneraciones deben
  incorporarse a la base ISR del mes cuando apliquen. El motor actual calcula
  salario base mensual; esos conceptos necesitan su propio ingreso antes de
  declararse productivos.
- La tasa SRL actual es 1.10%. Debe contrastarse por empresa con su riesgo
  asignado por IDOPPRIL/TSS.
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
