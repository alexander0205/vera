-- Link de pago del colegio: el padre ve lo que debe, transfiere y sube el
-- comprobante. El colegio aprueba.
--
-- Por qué el comprobante NO es un pago:
--
-- El módulo escolar dejó de llevar cobros propios a propósito (ver el POST
-- deprecado de /api/administracion-escolar/pagos): todo cobro vive en
-- `pagos_recibidos`, atado a la factura, y el saldo del cargo se deriva de ahí
-- con sincronizarSaldosDesdeFacturas. Si el comprobante entrara como pago
-- escolar, el colegio tendría dos verdades de cuánto le deben — que es
-- exactamente el sistema paralelo que se cerró.
--
-- Así que un comprobante es lo que de verdad es: alguien DICE que transfirió,
-- con una foto. No mueve un peso. Al aprobarlo, el cobro se registra por el
-- camino normal, en la factura.

-- ─── 1. Datos bancarios del colegio ──────────────────────────────────────────
-- Van aparte de `teams` y no como columnas sueltas porque son del colegio como
-- receptor de transferencias, no de la empresa como contribuyente: el titular
-- de la cuenta puede no ser la razón social, y con frecuencia no lo es.

CREATE TABLE IF NOT EXISTS admin_escolar_datos_pago (
  id                   serial PRIMARY KEY,
  team_id              integer NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  banco                varchar(120),
  tipo_cuenta          varchar(40),
  numero_cuenta        varchar(60),
  titular              varchar(200),
  rnc                  varchar(20),
  telefono_ayuda       varchar(40),
  horario_ayuda        varchar(120),
  instrucciones        text,
  acepta_transferencia boolean NOT NULL DEFAULT true,
  creado_en            timestamp NOT NULL DEFAULT now(),
  actualizado_en       timestamp NOT NULL DEFAULT now()
);

-- ─── 2. El link público, uno por responsable de pago ─────────────────────────
-- La llave es `clients`, NO `admin_escolar_tutores`: quien paga es el contacto
-- de Facturación al que apunta `estudiantes.facturar_a_client_id`, que es
-- exactamente a quien el motor de avisos ya le escribe. Un alumno puede tener
-- cuatro tutores y no se le cobra a los cuatro.
--
-- Uno y no uno por aviso: el padre recibe el enlace muchas veces al año y tiene
-- que caer siempre en la misma página, con la misma referencia. Si cada aviso
-- creara su link, el colegio recibiría transferencias con referencias distintas
-- del mismo padre y no podría casarlas.
--
-- Los cargos NO se congelan aquí. La página los calcula al abrirse: entre que
-- sale el aviso y el padre entra pueden haber pasado dos semanas, y enseñarle
-- una deuda vieja es peor que no enseñarle nada.

CREATE TABLE IF NOT EXISTS admin_escolar_links_pago (
  id             serial PRIMARY KEY,
  team_id        integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  client_id      integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Va en la URL. Largo y aleatorio: es la única credencial de la página.
  token          varchar(48) NOT NULL UNIQUE,
  -- Lo que el padre escribe en el concepto de la transferencia (ZER-8F32A1).
  referencia     varchar(24) NOT NULL,
  -- abierto | revocado
  estado         varchar(20) NOT NULL DEFAULT 'abierto',
  ultimo_acceso  timestamp,
  creado_en      timestamp NOT NULL DEFAULT now(),
  actualizado_en timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_links_pago_client_uq
  ON admin_escolar_links_pago (team_id, client_id);
CREATE INDEX IF NOT EXISTS admin_escolar_links_pago_team_idx
  ON admin_escolar_links_pago (team_id);

-- ─── 3. El comprobante ───────────────────────────────────────────────────────
-- `cargos` es una foto en JSON de qué se estaba debiendo cuando el padre subió
-- el papel, con concepto, estudiante y monto. Hace falta guardarla: para cuando
-- el colegio revise, el cargo pudo cambiar de monto, quedar facturado o
-- anularse, y sin la foto no hay forma de saber qué fue lo que el padre creyó
-- que estaba pagando.
--
-- El archivo sigue el mismo patrón que los comprobantes de facturación: S3 si
-- hay credenciales, base64 en Postgres si no (desarrollo local). Nunca se
-- emiten presigned URLs — se sirve por una ruta que valida sesión.

CREATE TABLE IF NOT EXISTS admin_escolar_comprobantes (
  id             serial PRIMARY KEY,
  team_id        integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  link_id        integer REFERENCES admin_escolar_links_pago(id) ON DELETE SET NULL,
  client_id      integer REFERENCES clients(id) ON DELETE SET NULL,

  monto_centavos integer NOT NULL,
  referencia     varchar(120),
  banco_origen   varchar(120),
  nota           text,

  -- s3 | db
  storage        varchar(10)  NOT NULL DEFAULT 's3',
  archivo_key    varchar(300),
  archivo_base64 text,
  archivo_mime   varchar(80)  NOT NULL,
  archivo_nombre varchar(200),
  archivo_bytes  integer      NOT NULL DEFAULT 0,

  cargos         jsonb        NOT NULL DEFAULT '[]'::jsonb,

  -- pendiente | aprobado | rechazado
  estado         varchar(20)  NOT NULL DEFAULT 'pendiente',
  revisado_por   integer REFERENCES users(id),
  revisado_en    timestamp,
  motivo_rechazo text,
  creado_en      timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escolar_comprobantes_team_estado_idx
  ON admin_escolar_comprobantes (team_id, estado);
CREATE INDEX IF NOT EXISTS admin_escolar_comprobantes_link_idx
  ON admin_escolar_comprobantes (link_id);
CREATE INDEX IF NOT EXISTS admin_escolar_comprobantes_client_idx
  ON admin_escolar_comprobantes (client_id);
