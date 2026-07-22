-- Configuración contable por empresa. Paso 3 del plan de contabilidad.
--
-- Traduce operaciones a cuentas SIN preguntarle al usuario en cada factura:
-- "cuando cobres en efectivo va a Caja", "el ITBIS de una venta va a la 2102".
-- Aquí no se genera ningún asiento — eso es el Paso 4. Esto solo dice DÓNDE.
--
-- Tres tablas, una por cada tipo de mapeo del plan:
--   contabilidad_config              → las cuentas generales, 1 fila por team
--   contabilidad_config_metodos_pago → por método de cobro (efectivo, tarjeta…)
--   contabilidad_config_ingresos     → override de ingreso por categoría/producto
--
-- Todas las FK apuntan hacia contabilidad_cuentas, products y categorias, nunca
-- al revés: ninguna tabla genérica gana columnas de contabilidad.

-- ─── Cuentas generales + interruptor del módulo ──────────────────────────────
-- Una sola fila por empresa, así que las cuentas van como columnas tipadas en
-- vez de un saco de clave-valor: son las que el Paso 4 va a pedir por nombre y
-- conviene que el compilador las conozca.
CREATE TABLE IF NOT EXISTS contabilidad_config (
  team_id integer PRIMARY KEY REFERENCES teams(id),

  -- Modo "sin contabilidad" del subpaso 4 del plan. Arranca APAGADO: una
  -- empresa no empieza a generar asientos por el hecho de haber entrado a la
  -- pantalla. Se enciende cuando la configuración está completa, y la propia
  -- API se niega a encenderlo si falta algo.
  activa boolean NOT NULL DEFAULT false,

  -- Las 5 del subpaso 1. Nullable porque la configuración se completa por
  -- partes; lo que las exige es `activa`, no la tabla.
  cuenta_por_cobrar_id    integer REFERENCES contabilidad_cuentas(id),
  cuenta_itbis_id         integer REFERENCES contabilidad_cuentas(id),
  cuenta_ingresos_id      integer REFERENCES contabilidad_cuentas(id),
  cuenta_descuentos_id    integer REFERENCES contabilidad_cuentas(id),
  cuenta_mora_id          integer REFERENCES contabilidad_cuentas(id),

  updated_by integer REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ─── Cuentas por método de cobro ─────────────────────────────────────────────
-- Clave-valor y no columnas: los métodos crecen (hoy 6 ofrecidos + 2 internos +
-- las pasarelas) y no quiero una migración por cada uno.
--
-- OJO con la clave: NO es `pagos_recibidos.metodo` tal cual. Un cobro por
-- CardNet/Azul se guarda como metodo='tarjeta', igual que una tarjeta pasada en
-- el mostrador, y solo se distingue por el vínculo desde payment_links. Pero
-- contablemente son cosas distintas: el cobro en línea NO entra al banco hasta
-- que la pasarela liquida. Por eso las claves 'pasarela_cardnet' /
-- 'pasarela_azul' existen aparte, y quien resuelve cuál aplica es
-- `claveContableDePago()` en lib/contabilidad/config.ts.
CREATE TABLE IF NOT EXISTS contabilidad_config_metodos_pago (
  id      serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id),

  -- efectivo | transferencia | tarjeta | cheque | deposito | otro
  -- saldo_favor | nota_credito | pasarela_cardnet | pasarela_azul
  clave     varchar(30) NOT NULL,
  cuenta_id integer NOT NULL REFERENCES contabilidad_cuentas(id),

  -- Solo para pasarelas: dónde va la comisión que retienen al liquidar. Es un
  -- gasto, no un menor ingreso — la venta fue por el total y el costo de
  -- cobrarla va aparte.
  cuenta_comision_id integer REFERENCES contabilidad_cuentas(id),

  updated_by integer REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now(),

  CONSTRAINT contabilidad_config_metodos_clave_chk
    CHECK (clave IN ('efectivo', 'transferencia', 'tarjeta', 'cheque',
                     'deposito', 'otro', 'saldo_favor', 'nota_credito',
                     'pasarela_cardnet', 'pasarela_azul'))
);

CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_config_metodos_team_clave_idx
  ON contabilidad_config_metodos_pago(team_id, clave);

-- ─── Override de la cuenta de ingreso ────────────────────────────────────────
-- El plan pide mapear ingresos por producto, servicio o categoría. Los dos
-- primeros los cubre `products.tipo` ('bien' | 'servicio') sin configuración
-- extra; esta tabla es para las excepciones que el usuario quiera afinar.
--
-- Orden de resolución (lo implementa resolverCuentaIngreso()):
--   producto → categoría → tipo del producto → cuenta de ingresos general
CREATE TABLE IF NOT EXISTS contabilidad_config_ingresos (
  id      serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id),

  -- Exactamente uno de los dos. El CHECK lo obliga.
  categoria_id integer REFERENCES categorias(id),
  producto_id  integer REFERENCES products(id),

  cuenta_id integer NOT NULL REFERENCES contabilidad_cuentas(id),

  updated_by integer REFERENCES users(id),
  updated_at timestamp NOT NULL DEFAULT now(),

  CONSTRAINT contabilidad_config_ingresos_destino_chk
    CHECK ((categoria_id IS NULL) <> (producto_id IS NULL))
);

-- Dos índices parciales en vez de uno compuesto: con NULLs, un UNIQUE normal
-- dejaría meter la misma categoría dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_config_ingresos_categoria_idx
  ON contabilidad_config_ingresos(team_id, categoria_id)
  WHERE categoria_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_config_ingresos_producto_idx
  ON contabilidad_config_ingresos(team_id, producto_id)
  WHERE producto_id IS NOT NULL;
