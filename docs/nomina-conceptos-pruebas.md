# Pruebas de ingresos y descuentos de nómina (Fase A)

Prueba hecha el 2026-10-09 contra la copia local de prod (empresa Andrés Bello), desde la interfaz real y con scripts inyectados en el navegador. Los datos de prueba se borraron y el módulo de nómina quedó apagado como estaba.

## Qué se probó

| Área | Pruebas | Resultado |
|---|---|---|
| Montos mal escritos | `abc`, vacío, negativo, 0, `12,50`, `0.001`, `1e400`, `Infinity`, `null`, `true`, `[5]`, `1e15`, `1e17` | Antes: aceptaba 0 centavos, `true`→RD$0.01, `[5]`→RD$5, RD$1 billón; `1e17` daba 500. Ahora: todo rechazado con mensaje claro |
| Texto hostil | NUL (`\u0000`), `<script>`, `<img onerror>`, `'; DROP TABLE`, emoji, RTL, 100,000 caracteres | NUL daba 500 en 4 rutas → ahora se limpia. En pantalla no se ejecuta nada (React escapa); texto de 300 caracteres seguidos desbordaba la fila → corregido |
| Fechas | `2026-02-30`, `9999-12-31`, `0001-01-01`, vacía, basura, «hasta» antes de «desde» | `9999-12-31` pasaba → ahora solo 2000–2100 |
| Aislamiento entre empresas | Empleado, concepto, cuenta, asignación y préstamo de otra empresa (IDs 1..10) | Todo 404/400; nada se filtra ni se modifica |
| Permisos | Rol lector: todas las rutas y la página | 403 y redirección |
| Doble clic / carrera | 3 clics seguidos en la UI; 12 peticiones simultáneas idénticas | UI: 1 registro. API: **antes 5 incentivos y 4 préstamos duplicados** → índice único en la base, ahora 1 |
| Préstamos | Cuota > monto, cuota 0, cuota de 1 centavo, 3 borradores seguidos que cobran más que el saldo, cancelar antes de aprobar | Antes: se cobraba de más. Ahora al aprobar se ajusta al saldo real y la diferencia vuelve al neto; saldo nunca negativo; se avisa |
| Descuento mayor que el neto | RD$50,000 contra neto de RD$28,227 | Neto en 0, se aplica lo que cabe y la corrida muestra «se pidió … el neto no alcanzó» |
| Contabilidad | Asientos con y sin cuentas propias, con ajustes de préstamo | Siempre cuadran; incentivo a su gasto, avances y préstamos a «Cuentas por cobrar empleados» |
| Cuenta equivocada | Incentivo→capital/ingresos/grupo; descuento→gasto/grupo | Antes aceptaba cualquiera → ahora exige gasto (ingresos) o activo/pasivo (descuentos), activa y de detalle |
| Volumen | 400 empleados, 2,000 conceptos, 400 préstamos | Generar 0.4 s, aprobar 0.5 s, detalle 72 ms (747 KB), totales y asiento cuadrados |
| Límites | 60 conceptos a un empleado | Tope de 50 activos por empleado |

## Cambios hechos por esta prueba

- `parseMontoPesos`: solo número o texto; admite `1,500.50`; rechaza `12,50`, más de 2 decimales, 0, negativos y más de RD$100 millones.
- `limpiarTexto`, `fechaRazonable`, tope de 520 cuotas por préstamo y de 50 activos por empleado.
- Índices únicos (migración 0185): no se duplica un concepto ni un préstamo nuevo idénticos.
- `reconciliarPrestamosDeCorrida`: antes de aprobar, baja cada descuento de préstamo a lo que su saldo admite.
- Cuentas contables validadas por tipo, activas y de detalle.
- `DELETE` devuelve 404 si no encontró nada (antes decía OK).
- Interfaz: textos largos no desbordan; aviso al aprobar si se ajustó un préstamo.

## Pendientes y decisiones abiertas (no resueltos)

1. **Baja con préstamo pendiente.** Dar de baja a un empleado no toca sus préstamos: quedan «activos» sin descontarse nunca. Falta avisar al dar de baja y cobrarlo en la liquidación (ver 2.8 de las tareas).
2. **Concepto fijo en un mes parcial.** Un empleado que entra o sale a mitad de mes cobra el incentivo fijo completo (el salario sí se prorratea). Decidir con el contable si se prorratea.
3. **Concepto de «una sola vez» para quien no tiene línea ese mes** (de baja, sin horas): no se aplica y no avisa.
4. **ISR de un ingreso extraordinario.** Un bono grande de un mes se calcula como si el sueldo mensual fuera siempre ese (escala anualizada), igual que el salario. Puede retener de más a quien recibe un bono único. Validar con el contable.
5. **Borrador con conceptos viejos.** Cambiar un concepto después de generar el borrador exige borrarlo y regenerarlo; solo los préstamos se corrigen solos al aprobar.
6. **Sin prueba de sesión caducada / token manipulado**: las rutas usan el guard común de la app (`requireModuleAndPermission`), probado solo con roles válidos.
7. La prueba de carga fue de un solo usuario; no se midió concurrencia de varias corridas a la vez.
