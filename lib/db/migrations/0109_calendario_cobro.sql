-- Calendario de cobro: en cuántas partes se paga cada concepto y cuándo vence.
--
-- Hasta ahora un concepto solo sabía decir `recurrente` sí/no, que distingue
-- "una vez" de "cada mes" y nada más. Los colegios no caben ahí: unos cobran la
-- inscripción en dos pagos (agosto y enero), otros la colegiatura completa de
-- una, otros en diez mensualidades. Con una fila por cuota los tres casos son
-- el mismo mecanismo y no hace falta código distinto para cada uno.

CREATE TABLE IF NOT EXISTS admin_escolar_concepto_cuotas (
  id                 serial PRIMARY KEY,
  team_id            integer NOT NULL REFERENCES teams(id),
  concepto_id        integer NOT NULL REFERENCES admin_escolar_conceptos_pago(id) ON DELETE CASCADE,
  -- El calendario es del año escolar: la colegiatura de 2026-2027 puede
  -- repartirse distinto que la de 2027-2028 sin duplicar el concepto.
  periodo_id         integer NOT NULL REFERENCES admin_escolar_periodos(id) ON DELETE CASCADE,
  numero             smallint NOT NULL,
  -- Cómo se llama en la factura y en la lista de deuda: "1ra inscripción",
  -- "Agosto". Sin esto el padre ve tres líneas iguales y no sabe cuál pagó.
  etiqueta           varchar(60) NOT NULL,
  -- Mes 1-12 cuando la cuota corresponde a un mes concreto; alimenta
  -- `admin_escolar_cargos.mes`. NULL para inscripción, uniformes y demás.
  mes                smallint,
  fecha_vencimiento  date NOT NULL,
  -- Qué parte del monto del concepto se cobra aquí, en milésimas de por ciento
  -- (100000 = 100%). En milésimas y no en porcentaje entero porque partir en
  -- tres da 33,333% y con enteros se pierde un peso en cada cuota.
  porcentaje_milesimas integer NOT NULL DEFAULT 100000,
  activo             boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_concepto_cuotas_unica
  ON admin_escolar_concepto_cuotas (concepto_id, periodo_id, numero);

CREATE INDEX IF NOT EXISTS admin_escolar_concepto_cuotas_periodo
  ON admin_escolar_concepto_cuotas (team_id, periodo_id);

-- Qué conceptos llegan ya marcados al matricular. La inscripción y la
-- colegiatura las paga todo el mundo; el uniforme no, y obligar a desmarcarlo
-- 465 veces es peor que obligar a marcarlo cuando toca.
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS aplica_por_defecto boolean NOT NULL DEFAULT false;

-- La beca es sobre la colegiatura, no sobre los materiales gastables. Sin esta
-- columna el motor se guiaba por `recurrente`, que es otra cosa: un concepto
-- puede cobrarse en cuotas sin que la beca lo toque.
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS admite_beca boolean NOT NULL DEFAULT false;

-- Arranque razonable para lo que ya está creado: la mensualidad es lo que
-- lleva beca, y ella y la inscripción son las que se cobran siempre.
UPDATE admin_escolar_conceptos_pago SET admite_beca = true WHERE tipo = 'mensualidad';
UPDATE admin_escolar_conceptos_pago SET aplica_por_defecto = true
  WHERE tipo IN ('inscripcion', 'mensualidad');

-- De qué cuota salió cada cargo.
ALTER TABLE admin_escolar_cargos
  ADD COLUMN IF NOT EXISTS cuota_id integer REFERENCES admin_escolar_concepto_cuotas(id);

-- Lo importante de esta migración. La tabla no tenía NINGUNA restricción única,
-- así que dos clics en "Matricular" —o reintentar tras un error de red— le
-- cobraban la inscripción dos veces al mismo padre. Es índice parcial porque
-- los cargos viejos y los que se creen a mano no tienen cuota.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_cargos_matricula_cuota
  ON admin_escolar_cargos (matricula_id, cuota_id)
  WHERE cuota_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_escolar_cargos_cuota
  ON admin_escolar_cargos (cuota_id);
