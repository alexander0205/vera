# Mini plan: asientos contables y reportes

## Enfoque inicial

Priorizar primero la parte de asientos contables y reportes contables, especialmente el balance general. Luego se revisan catalogo completo de cuentas, cuentas por cobrar y automatizaciones mas especificas.

Aunque el foco inicial sean asientos y reportes, se necesita crear al menos un catalogo de cuentas basico, porque los asientos necesitan saber que cuentas van a mover.

## 1. Catalogo contable minimo

Objetivo: tener las cuentas necesarias para registrar asientos y generar reportes basicos.

Cuentas iniciales sugeridas:

- Caja.
- Bancos.
- Cuentas por cobrar.
- Ventas / ingresos.
- ITBIS por pagar.
- Retenciones.
- Notas de credito / devoluciones.
- Mora / recargos.
- Gastos.
- Capital / patrimonio.

Cada cuenta deberia tener:

- Codigo.
- Nombre.
- Tipo: activo, pasivo, patrimonio, ingreso o gasto.
- Estado: activa/inactiva.

## 2. Asientos contables

Objetivo: registrar formalmente los movimientos contables que luego alimentan los reportes.

Cada asiento deberia tener:

- Fecha.
- Concepto.
- Documento origen: factura, pago, nota, ajuste.
- Usuario que lo genero.
- Lineas con cuenta, debito, credito y descripcion.

Regla clave:

```text
Total debitos = Total creditos
```

Ejemplo factura a credito:

```text
Debito:  Cuentas por cobrar
Credito: Ventas
Credito: ITBIS por pagar
```

Ejemplo pago recibido:

```text
Debito:  Banco / Caja
Credito: Cuentas por cobrar
```

## 3. Reportes contables iniciales

Objetivo: usar los asientos para generar informacion contable util.

Reportes prioritarios:

- Balance general.
- Balance de comprobacion.
- Libro diario.
- Mayor general.

El mas importante para validar inicialmente:

```text
Balance general = Activos, Pasivos y Patrimonio calculados desde los saldos de las cuentas.
```

## 4. Relacion entre asientos y balance general

Los asientos contables son la base del balance general.

Cada asiento mueve cuentas. Con esos movimientos, EmiteDO puede calcular saldos de:

- Activos.
- Pasivos.
- Patrimonio.

Luego esos saldos se presentan en el balance general.

Flujo resumido:

```text
Factura / pago / nota
        ↓
Asiento contable
        ↓
Movimientos por cuenta
        ↓
Saldos contables
        ↓
Balance general y otros reportes
```

## 5. Lo que queda para despues

Despues de validar asientos y reportes iniciales, se revisaria:

- Catalogo de cuentas completo y personalizable.
- Automatizaciones mas especificas.
- Cuentas por cobrar avanzadas.
- Notas de credito, anulaciones, mora y retenciones con reglas contables completas.
- Configuracion de cuentas automaticas por empresa, producto, metodo de pago o cliente.

## 6. Estrategia de rama y migraciones

Como esta parte puede tocar facturas, pagos, caja, POS, inventario y reportes, conviene crear la rama desde la rama mas completa disponible.

Recomendacion:

```text
pos-cafeteria
  └── contabilidad-asientos-reportes
```

Motivo:

- POS cafeteria ya deberia tener la version mas completa de ventas, pagos, caja e inventario.
- Los asientos contables necesitan partir de esos flujos reales.
- Se reducen conflictos y retrabajo.
- El PR contable quedaria dependiente de que POS se fusione primero.

Migraciones:

- Usar numeros posteriores a los de POS/inventario.
- Revisar la numeracion final antes de abrir o cerrar el PR.
- Ejemplo:

```text
0068_contabilidad_catalogo_cuentas.sql
0069_asientos_contables.sql
0070_reportes_contables.sql
```
