-- Nómina · Dependientes adicionales del SFS, piso de cotización y tasa SRL.
--
-- 1) Dependientes del empleado en el Seguro Familiar de Salud. Los DIRECTOS
--    (cónyuge, hijos menores) no cuestan; los ADICIONALES (hijos mayores de 18
--    que no estudian o mayores de 21, padres y suegros) le cuestan al trabajador
--    una cápita mensual que la TSS factura al empleador. `tipo` guarda lo que está
--    REGISTRADO, porque eso es lo que se factura. Fuente: FAQ de la TSS.
-- 2) Piso de cotización: la base para cotizar no baja del salario mínimo del
--    sector sin dispensa (Res. CNSS 471-02). El tamaño de empresa define ese
--    mínimo; la dispensa se marca por empleado.
-- 3) Tasa SRL de la empresa: 1 % fijo + 0.1–0.3 % según su riesgo (IDOPPRIL).
-- 4) Foto en la línea de la corrida: base cotizable usada, dependientes cobrados
--    y su cápita, para que la historia no cambie si la ficha cambia.
--
-- Aditiva e idempotente: IF NOT EXISTS porque estas migraciones se corren a mano.

CREATE TABLE IF NOT EXISTS empleado_dependientes (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  empleado_id      INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  nombre           VARCHAR(200) NOT NULL,
  cedula           VARCHAR(20),
  parentesco       VARCHAR(20) NOT NULL,
  fecha_nacimiento DATE,
  estudiante       BOOLEAN NOT NULL DEFAULT false,
  tipo             VARCHAR(10) NOT NULL,
  desde            DATE NOT NULL,
  hasta            DATE,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT empleado_dependientes_tipo_chk CHECK (tipo IN ('directo', 'adicional')),
  CONSTRAINT empleado_dependientes_parentesco_chk
    CHECK (parentesco IN ('conyuge', 'hijo', 'hijastro', 'padre_madre', 'suegro_suegra')),
  CONSTRAINT empleado_dependientes_rango_chk CHECK (hasta IS NULL OR hasta >= desde)
);

CREATE INDEX IF NOT EXISTS empleado_dependientes_empleado_idx ON empleado_dependientes (empleado_id);
CREATE INDEX IF NOT EXISTS empleado_dependientes_team_idx     ON empleado_dependientes (team_id);

ALTER TABLE teams     ADD COLUMN IF NOT EXISTS nomina_tamano_empresa   VARCHAR(10);
ALTER TABLE teams     ADD COLUMN IF NOT EXISTS nomina_srl_tasa         NUMERIC(6, 4);
ALTER TABLE empleados ADD COLUMN IF NOT EXISTS dispensa_salario_minimo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS salario_cotizable_cents        BIGINT;
ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS dependientes_adicionales       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS dependientes_adicionales_cents BIGINT  NOT NULL DEFAULT 0;
