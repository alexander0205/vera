-- Nómina · Fase 3 — Corridas de nómina.
-- Una corrida (nomina_corridas) es la nómina de un período; sus líneas
-- (nomina_lineas) son cada empleado calculado, con el desglose completo y un
-- snapshot de su nombre/cédula/cargo para que la historia no cambie si el
-- empleado se edita después. Aditivo puro; IF NOT EXISTS porque va a mano.
CREATE TABLE IF NOT EXISTS nomina_corridas (
  id                       SERIAL PRIMARY KEY,
  team_id                  INTEGER NOT NULL REFERENCES teams(id),
  periodo                  VARCHAR(7)   NOT NULL,
  descripcion              VARCHAR(160) NOT NULL,
  tipo                     VARCHAR(20)  NOT NULL DEFAULT 'mensual',
  fecha_pago               DATE,
  estado                   VARCHAR(20)  NOT NULL DEFAULT 'borrador',
  anio_tasas               INTEGER      NOT NULL,
  total_bruto_cents        BIGINT       NOT NULL DEFAULT 0,
  total_deducciones_cents  BIGINT       NOT NULL DEFAULT 0,
  total_neto_cents         BIGINT       NOT NULL DEFAULT 0,
  total_patronal_cents     BIGINT       NOT NULL DEFAULT 0,
  asiento_id               INTEGER      REFERENCES contabilidad_asientos(id),
  created_by               INTEGER      REFERENCES users(id),
  created_at               TIMESTAMP    NOT NULL DEFAULT now(),
  aprobada_en              TIMESTAMP,
  pagada_en                TIMESTAMP
);

CREATE INDEX  IF NOT EXISTS nomina_corridas_team_idx     ON nomina_corridas (team_id);
CREATE UNIQUE INDEX IF NOT EXISTS nomina_corridas_periodo_uniq ON nomina_corridas (team_id, periodo, tipo);

CREATE TABLE IF NOT EXISTS nomina_lineas (
  id                       SERIAL PRIMARY KEY,
  corrida_id               INTEGER NOT NULL REFERENCES nomina_corridas(id) ON DELETE CASCADE,
  team_id                  INTEGER NOT NULL REFERENCES teams(id),
  empleado_id              INTEGER NOT NULL REFERENCES empleados(id),
  nombre                   VARCHAR(320) NOT NULL,
  cedula                   VARCHAR(20),
  cargo                    VARCHAR(120),
  bruto_cents              BIGINT NOT NULL,
  afp_empleado_cents       BIGINT NOT NULL,
  sfs_empleado_cents       BIGINT NOT NULL,
  isr_cents                BIGINT NOT NULL,
  otras_deducciones_cents  BIGINT NOT NULL DEFAULT 0,
  total_deducciones_cents  BIGINT NOT NULL,
  afp_patronal_cents       BIGINT NOT NULL,
  sfs_patronal_cents       BIGINT NOT NULL,
  srl_patronal_cents       BIGINT NOT NULL,
  infotep_patronal_cents   BIGINT NOT NULL,
  total_patronal_cents     BIGINT NOT NULL,
  neto_cents               BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS nomina_lineas_corrida_idx ON nomina_lineas (corrida_id);
CREATE INDEX IF NOT EXISTS nomina_lineas_team_idx    ON nomina_lineas (team_id);
