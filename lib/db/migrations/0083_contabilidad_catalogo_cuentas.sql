-- Catálogo de cuentas contables. Paso 2 del plan de contabilidad.
--
-- Es el mapa contable de cada empresa: la lista de cuentas donde después se
-- van a clasificar los movimientos. Aquí NO hay movimientos todavía — los
-- asientos llegan en el Paso 4. Esta tabla solo define el destino.
--
-- Una tabla, jerárquica por self-FK. No toca ninguna tabla existente y no
-- agrega columnas a products ni a ecf_documents: la relación con las entidades
-- genéricas se resolverá en el Paso 3 (cuentas automáticas), y en esa dirección
-- — la configuración contable apunta a la cuenta, la factura no sabe de cuentas.

CREATE TABLE IF NOT EXISTS contabilidad_cuentas (
  id              serial PRIMARY KEY,
  team_id         integer NOT NULL REFERENCES teams(id),

  -- Código contable. Estable por contrato: una vez que la cuenta tiene
  -- movimientos ya no se puede cambiar, porque los reportes históricos y las
  -- conciliaciones externas se referencian por código, no por id.
  codigo          varchar(20) NOT NULL,
  nombre          varchar(120) NOT NULL,

  -- Las 6 clases del plan.
  tipo            varchar(20) NOT NULL,

  -- Se GUARDA, no se deriva de `tipo`. La mayoría de las cuentas siguen a su
  -- clase (activo/costo/gasto → deudora; pasivo/patrimonio/ingreso → acreedora),
  -- pero las cuentas de contrapartida la invierten: "Descuentos y devoluciones
  -- sobre ventas" es de tipo ingreso y naturaleza deudora, porque resta.
  -- Derivarla de `tipo` haría imposible representarlas.
  naturaleza      varchar(10) NOT NULL,

  -- Jerarquía. NULL = cuenta raíz. Se valida en la aplicación que el padre sea
  -- del mismo team y que no se formen ciclos; Postgres no puede expresarlo.
  cuenta_padre_id integer REFERENCES contabilidad_cuentas(id),

  -- Si acepta asientos directos. Solo las hojas reciben movimientos; las cuentas
  -- padre agrupan y su saldo es la suma de sus hijas.
  --
  -- Flag explícito y no derivado de "no tiene hijos" a propósito: si mañana se
  -- le cuelga una hija a una cuenta que ya tiene movimientos, derivarlo la
  -- volvería no-imputable de golpe y dejaría asientos existentes colgando de una
  -- cuenta que "no acepta asientos". Con el flag, ese caso se detecta y se
  -- bloquea en vez de corromperse en silencio.
  imputable       boolean NOT NULL DEFAULT true,

  -- Desactivar en vez de borrar. Una cuenta con historia no se elimina nunca:
  -- se apaga para que no aparezca al clasificar, pero sus movimientos pasados
  -- siguen siendo válidos y los reportes históricos siguen cuadrando.
  activa          boolean NOT NULL DEFAULT true,

  -- Marca las cuentas creadas por la siembra del catálogo base, para poder
  -- distinguirlas de las que creó el usuario (útil al recargar el catálogo y
  -- para no ofrecer borrar las estructurales).
  es_base         boolean NOT NULL DEFAULT false,

  created_by      integer REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_by      integer REFERENCES users(id),
  updated_at      timestamp NOT NULL DEFAULT now(),

  CONSTRAINT contabilidad_cuentas_tipo_chk
    CHECK (tipo IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto')),
  CONSTRAINT contabilidad_cuentas_naturaleza_chk
    CHECK (naturaleza IN ('deudora', 'acreedora')),
  -- Una cuenta no puede ser su propio padre. Los ciclos más largos los ataja la
  -- aplicación; este CHECK cubre el caso trivial, que es el que se cuela solo.
  CONSTRAINT contabilidad_cuentas_no_autopadre_chk
    CHECK (cuenta_padre_id IS NULL OR cuenta_padre_id <> id),
  CONSTRAINT contabilidad_cuentas_codigo_no_vacio_chk
    CHECK (btrim(codigo) <> '')
);

-- El código identifica la cuenta dentro de la empresa. Es la clave con la que
-- trabaja el contador y por la que se buscará al configurar las automáticas.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_cuentas_team_codigo_idx
  ON contabilidad_cuentas(team_id, codigo);

-- Listado del catálogo ordenado por código, que es como se lee un plan de cuentas.
CREATE INDEX IF NOT EXISTS contabilidad_cuentas_team_idx
  ON contabilidad_cuentas(team_id, codigo);

-- Para armar el árbol sin escanear todo el catálogo.
CREATE INDEX IF NOT EXISTS contabilidad_cuentas_padre_idx
  ON contabilidad_cuentas(team_id, cuenta_padre_id);

-- Al clasificar un movimiento solo interesan las cuentas activas e imputables.
CREATE INDEX IF NOT EXISTS contabilidad_cuentas_imputables_idx
  ON contabilidad_cuentas(team_id, tipo)
  WHERE activa AND imputable;
