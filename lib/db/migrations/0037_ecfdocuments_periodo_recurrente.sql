-- 0037 — Período recurrente en ecf_documents
--
-- Añade ecf_documents.periodo_recurrente (date) para que cada factura generada
-- desde una recurrente quede ligada a UNA fecha de cobro específica del schedule.
-- Esto permite el timeline de períodos: 1 fila por fecha de cobro, generar
-- cualquier período (no solo el próximo), y detectar duplicados por período.

ALTER TABLE ecf_documents ADD COLUMN IF NOT EXISTS periodo_recurrente date;

-- ─── Backfill por orden ──────────────────────────────────────────────────────
-- Para cada recurrente, a sus ecf_documents (origen_recurrente_id = fr.id) NO
-- anuladas, ordenadas por id ASC, se les asigna el período arrancando en
-- fecha_inicio y avanzando un paso por frecuencia:
--   semanal   = +7 días
--   quincenal = +15 días
--   mensual   = +1 mes   (clamp del día a dia_cobro / último día del mes)
--   trimestral= +3 meses (idem clamp)
--   anual     = +12 meses(idem clamp)
-- Para mensual/trimestral/anual el día objetivo es dia_cobro (si existe) o el
-- día de fecha_inicio, recortado al último día del mes destino.

DO $$
DECLARE
  fr            RECORD;
  doc           RECORD;
  periodo       date;
  paso          integer;     -- meses por paso (0 = manejado por días)
  dias          integer;     -- días por paso (para semanal/quincenal)
  base_month    date;        -- primer día del mes destino
  target_day    integer;     -- día deseado (dia_cobro o día de fecha_inicio)
  last_day      integer;     -- último día del mes destino
  primera       boolean;
BEGIN
  FOR fr IN
    SELECT id, frecuencia, dia_cobro, fecha_inicio
    FROM facturas_recurrentes
  LOOP
    -- Determinar avance según frecuencia
    IF fr.frecuencia = 'semanal' THEN
      dias := 7;  paso := 0;
    ELSIF fr.frecuencia = 'quincenal' THEN
      dias := 15; paso := 0;
    ELSIF fr.frecuencia = 'mensual' THEN
      dias := 0;  paso := 1;
    ELSIF fr.frecuencia = 'trimestral' THEN
      dias := 0;  paso := 3;
    ELSIF fr.frecuencia = 'anual' THEN
      dias := 0;  paso := 12;
    ELSE
      dias := 0;  paso := 1; -- fallback mensual
    END IF;

    periodo := fr.fecha_inicio;
    primera := true;

    FOR doc IN
      SELECT id
      FROM ecf_documents
      WHERE origen_recurrente_id = fr.id
        AND estado <> 'ANULADO'
      ORDER BY id ASC
    LOOP
      IF NOT primera THEN
        IF paso = 0 THEN
          -- semanal / quincenal: avance por días
          periodo := periodo + (dias || ' days')::interval;
        ELSE
          -- mensual / trimestral / anual: avance por meses con clamp de día
          base_month := date_trunc('month', periodo)::date + (paso || ' months')::interval;
          target_day := COALESCE(fr.dia_cobro, EXTRACT(DAY FROM fr.fecha_inicio)::integer);
          last_day   := EXTRACT(DAY FROM (date_trunc('month', base_month) + interval '1 month - 1 day'))::integer;
          periodo    := date_trunc('month', base_month)::date
                        + ((LEAST(target_day, last_day) - 1) || ' days')::interval;
        END IF;
      END IF;

      UPDATE ecf_documents
      SET periodo_recurrente = periodo
      WHERE id = doc.id;

      primera := false;
    END LOOP;
  END LOOP;
END $$;
