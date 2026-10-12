-- Asientos contables. Paso 4 del plan de contabilidad.
--
-- Aquí es donde el módulo empieza a escribir números de verdad: cada factura y
-- cada pago produce su asiento de partida doble. Los Pasos 2 y 3 solo definían
-- el destino; esto lo usa.
--
-- Dos tablas, encabezado y líneas, como pide el plan.
--
-- **El nombre `contabilidad_asiento_lineas` y las columnas `team_id`/`cuenta_id`
-- están comprometidos**: `tieneMovimientos()` en lib/contabilidad/cuentas.ts ya
-- los consulta con to_regclass para proteger el catálogo. Si se renombran, esa
-- protección se queda muda sin avisar.

-- ─── Encabezado ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad_asientos (
  id      serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id),

  -- Fecha contable del hecho, no del registro. Un pago cargado con retraso se
  -- asienta en su fecha real, que es lo que mira el contador al cerrar el mes.
  fecha   date NOT NULL,

  concepto varchar(255) NOT NULL,

  -- De dónde salió. La FK va en esta dirección: el asiento conoce la factura,
  -- la factura no sabe del asiento (regla de no contaminar entidades genéricas).
  --   'factura' → ecf_documents.id
  --   'pago'    → pagos_recibidos.id
  -- 'nota' y 'anulacion' llegan en el Paso 5; el CHECK ya los admite para no
  -- tener que migrar la restricción entonces.
  origen_tipo varchar(20) NOT NULL,
  origen_id   integer NOT NULL,

  -- Total del asiento en centavos. Debe == haber == este número, garantizado
  -- por la aplicación antes de insertar. Se guarda para no tener que sumar las
  -- líneas cada vez que se lista el libro diario.
  total_cents bigint NOT NULL,

  created_by integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),

  CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion')),
  CONSTRAINT contabilidad_asientos_total_chk
    CHECK (total_cents > 0)
);

-- Idempotencia: un origen produce UN asiento y nada más. Es lo que permite
-- reintentar la generación sin duplicar contabilidad, que es el error más caro
-- que puede cometer este módulo.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_asientos_origen_idx
  ON contabilidad_asientos(team_id, origen_tipo, origen_id);

-- Libro diario: por fecha descendente.
CREATE INDEX IF NOT EXISTS contabilidad_asientos_team_fecha_idx
  ON contabilidad_asientos(team_id, fecha DESC, id DESC);

-- ─── Líneas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad_asiento_lineas (
  id         serial PRIMARY KEY,
  asiento_id integer NOT NULL REFERENCES contabilidad_asientos(id) ON DELETE CASCADE,
  team_id    integer NOT NULL REFERENCES teams(id),
  cuenta_id  integer NOT NULL REFERENCES contabilidad_cuentas(id),

  -- Una línea es débito O crédito, nunca las dos ni ninguna. Guardarlas como
  -- dos columnas (en vez de un monto con signo) es como lo lee un contador y
  -- como se imprime un libro diario.
  debe_cents  bigint NOT NULL DEFAULT 0,
  haber_cents bigint NOT NULL DEFAULT 0,

  descripcion varchar(255),
  orden       integer NOT NULL DEFAULT 0,

  CONSTRAINT contabilidad_asiento_lineas_signo_chk
    CHECK (debe_cents >= 0 AND haber_cents >= 0),
  -- Exactamente uno de los dos con valor. Un apunte que es débito y crédito a
  -- la vez, o que no es ninguno, no significa nada.
  CONSTRAINT contabilidad_asiento_lineas_una_columna_chk
    CHECK ((debe_cents > 0) <> (haber_cents > 0))
);

CREATE INDEX IF NOT EXISTS contabilidad_asiento_lineas_asiento_idx
  ON contabilidad_asiento_lineas(asiento_id, orden);

-- El que usa tieneMovimientos() para saber si una cuenta se puede borrar, y el
-- que usará el balance del Paso 6 para sumar por cuenta.
CREATE INDEX IF NOT EXISTS contabilidad_asiento_lineas_cuenta_idx
  ON contabilidad_asiento_lineas(team_id, cuenta_id);
