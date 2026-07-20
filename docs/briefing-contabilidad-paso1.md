# Briefing — Contabilidad, Paso 1 (cartera)

> Para entender el módulo y poder defenderlo frente a Alex. Dos partes: qué es
> esto y cómo funciona por dentro (para entenderlo), y un guion de prueba en la
> UI (para enseñarlo).
>
> El detalle técnico vive en `docs/seguimiento-contabilidad.md`; lo que Alex
> necesita para revisar el PR, en `docs/notas-pr-contabilidad-paso1.md`.

---

## 1. Qué es esto, en una frase

**Saber cuánto le deben a la empresa, quién, desde cuándo, y dejar constancia de
lo que se hizo para cobrarlo.**

Eso es el Paso 1. Nada más.

### Lo que este módulo NO hace todavía

Esto es lo primero que hay que dejar claro, porque el nombre "Contabilidad"
promete más de lo que hay hoy:

- **No genera asientos contables.** No existe ninguna tabla de asientos.
- **No hay catálogo de cuentas.** Ni una sola cuenta contable en el schema.
- **No produce estados financieros.** Ni balance, ni estado de resultados.

El motor contable de verdad arranca en el **Paso 2**. De los 6 pasos del plan
(`docs/plan-contabilidad-vera.md`), este es el **1 de 6**.

Por qué se empezó por cartera y no por asientos: fue decisión de Alex. La lógica
es que los asientos se alimentan de datos que tienen que estar correctos primero
—cuánto se debe, cuánto se pagó, qué notas de crédito aplican—, y esa era
justamente la parte que estaba mal calculada.

---

## 2. La fórmula del saldo

Es el corazón del módulo. Si se entiende esto, se entiende todo lo demás.

```
saldoFactura = max(0, montoTotal − pagado − notasDeCrédito)
saldo        = saldoFactura + moraPendiente
```

**Dos números distintos, y la diferencia importa:**

- `saldoFactura` — lo que queda debiendo **de la factura misma**.
- `saldo` — lo que hay que cobrarle al cliente **en total**, incluyendo los
  recargos por mora.

Se separan porque una factura puede estar completamente saldada y seguir
apareciendo en la cartera: pagó la factura pero le quedó debiendo la mora. El
caso sembrado `SEEDCXC-SALDADAMORA` es exactamente eso.

El `max(0, …)` existe porque una nota de crédito puede ser mayor que el saldo.
Sin él, esa factura aportaría un número negativo y restaría del total de la
cartera, como si el cliente debiera menos por otras facturas.

### Qué entra en la cartera

Toda factura con saldo pendiente, sin importar si el e-CF llegó a la DGII. Se
excluyen:

- Anuladas y rechazadas.
- Las notas de crédito (no son cuentas por cobrar: acreditan contra su factura).
- Las notas de débito por mora **como filas propias** — se agrupan dentro de su
  factura padre, para no contar dos veces al mismo cliente.

---

## 3. El arreglo central: el saldo se calcula en SQL

Es el cambio más importante del Paso 1 y el que más conviene saber explicar.

**Antes:** la consulta traía las facturas, y el saldo se calculaba en JavaScript
después. El problema: el `LIMIT` de la base recortaba **antes** de descartar las
facturas con saldo cero. Con más de 2000 documentos abiertos, la cartera se
truncaba **en silencio** — los totales salían incompletos y nada en la pantalla
avisaba.

**Ahora:** el saldo, si está vencida y cuántos días lleva se calculan en SQL, y
el filtro `saldo > 0` corre antes del `LIMIT`.

Consecuencias visibles:

- **Los totales de arriba cubren toda la cartera, no la página que se está
  viendo.** Se puede pasar de la página 1 a la 3 y los totales no se mueven.
- Filtros, orden y búsqueda corren en el servidor.
- `hoy` lo resuelve Postgres en zona RD, no el navegador.

### Por qué la zona horaria importa

Producción corre en UTC y República Dominicana es UTC−4. "Hoy" se calculaba en
UTC, así que **entre las 8 de la noche y la medianoche hora RD el sistema creía
que ya era mañana**.

El punto grave: el recargo por mora se generaba **un día antes de tiempo**. Eso
es cobrarle de más a un cliente.

Corregido. Queda una pregunta abierta que necesita acceso a producción: si hay
facturas con fecha límite puesta. Si no las hay, el bug nunca llegó a dispararse.

---

## 4. Qué hay en pantalla

`/dashboard/cuentas-por-cobrar`

| Zona | Qué muestra |
|---|---|
| 4 tarjetas | Pendiente, vencido, cuántas cuentas, cuántas vencidas |
| Promesas de pago | Pendientes, monto comprometido, incumplidas |
| 5 cubetas | Por vencer, 1-30, 31-60, 61-90, +90 días |
| Tabla | La cartera, con filtros, orden, búsqueda y agrupación |
| Panel de detalle | El desglose que **explica** el saldo, con historial |
| Gestión de cobro | Contactos, notas y promesas |

Dos detalles de diseño que conviene poder justificar:

- **Al elegir una cubeta, las demás conservan su monto.** Es a propósito: si
  todas se pusieran en cero al filtrar, no se podría saltar entre cubetas sin
  perder la referencia.
- **La tira de promesas no sigue el filtro activo.** Una promesa incumplida no
  deja de serlo porque el usuario esté mirando otra cubeta.

---

## 5. Guion de prueba en la UI

Sembrar los escenarios primero (team 9, todo con prefijo `SEEDCXC`, no se mezcla
con datos reales):

```bash
npx tsx scripts/seed-cartera-escenarios.ts 9
```

1. **Las cubetas suman el total.** Sumar las 5 y comparar con "Pendiente".
2. **Clic en una cubeta filtra; segundo clic lo quita.** Las demás conservan su
   monto.
3. **Paginación.** Ir a la página 2 y comprobar que los totales de arriba **no
   cambian**. Este es el arreglo central del Paso 1.
4. **Búsqueda.** Escribir un nombre: espera a que se pare de teclear antes de
   consultar (una sola consulta, no una por tecla).
5. **Panel de detalle** (icono de panel en la fila): el desglose explica el saldo
   — total, pagado, notas de crédito, saldo de factura, mora.
6. **Gestión de cobro:** registrar un contacto, una nota y una promesa. Cerrar la
   promesa. Fijar próxima acción.
7. **Recordatorio** (menú de 3 puntos, o seleccionando varias filas): muestra la
   previsualización con quién recibiría y quién queda fuera. **No envía hasta
   confirmar.**
8. **Exportar:** el archivo respeta los filtros activos y trae toda la cartera,
   no la página.

### Casos sembrados que vale la pena enseñar

| Caso | Qué demuestra |
|---|---|
| `SEEDCXC-CONNCID` | Una nota de crédito restando del saldo |
| `SEEDCXC-CONMORA` | Mora que ignora correctamente una ND anulada |
| `SEEDCXC-SALDADAMORA` | Factura pagada que sigue en cartera solo por su mora |
| `SEEDCXC-VENC100` | Cubeta de +90 días |

---

## 6. Lo que le toca decidir a Alex

Tres cosas. Conviene llegar con ellas planteadas, no descubrirlas en la reunión.

**1. El reporte de antigüedad va a mostrar cifras más bajas.**
Tenía su propia consulta del saldo, distinta de la pantalla de cobros: no
restaba notas de crédito. Las dos pantallas le daban números distintos al mismo
usuario para lo mismo. Ya está corregido —ahora ambas dan RD$77,245 en el team
9— pero el reporte está en producción y el número baja de RD$78,295. Si alguien
concilió contra el número viejo, lo va a notar.

**2. El hotfix de zona horaria.**
Ya está mergeado dentro de esta rama. Falta confirmar contra producción si el bug
llegó a cobrarle de más a alguien. La consulta está escrita en las notas del PR.

**3. Cuándo se despliega.**
Esta rama sale de `feature/administracion-escolar`, y escolar todavía no está en
`main`. **Contabilidad no puede subir antes que escolar.**

---

## 7. Qué sigue

**Paso 2: catálogo de cuentas contables.** Ahí arranca el motor contable. Nada
empezado. La primera migración libre es la **0083**.

---

## 8. Si preguntan "¿cómo sé que esto funciona?"

- `npm run test:unit` — 13 pruebas del cálculo de fechas en zona RD.
- `npx tsx scripts/validar-cartera.ts 9` — 37 comprobaciones contra datos reales:
  vencimientos exactos, mora, las 5 variantes de nota de crédito, exclusiones,
  totales, filtros, orden, paginación y trazabilidad del detalle.
- El envío real de un recordatorio se probó de punta a punta contra un correo
  propio del equipo, y el dato de prueba se revirtió después.

Vale la pena decir también **qué encontró abrir el navegador que las pruebas no
podían ver**: una fecha que se mostraba malformada, y un filtro que disparaba dos
consultas en vez de una. Ninguna suite lo habría detectado.
