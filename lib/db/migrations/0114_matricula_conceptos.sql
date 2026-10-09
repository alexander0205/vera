-- Qué conceptos se le cobran a ESTA matrícula.
--
-- Hasta ahora la decisión vivía en el catálogo (`aplica_por_defecto`): el
-- concepto se cobraba a todo el mundo o a nadie, y lo que la secretaria
-- desmarcaba al matricular no quedaba anotado en ninguna parte. El devengo
-- mensual no podía distinguir "a este alumno no le toca" de "todavía no le ha
-- tocado", así que volvía a añadir lo desmarcado al mes siguiente.
--
-- Guardándolo aquí, lo que se decide al matricular es lo que se cobra el año
-- entero: desmarcar pega, y un concepto cuya única cuota vence en marzo se
-- sigue devengando en marzo aunque en agosto no generara ningún cargo.
--
-- Va como jsonb en la propia matrícula y no en una tabla aparte porque solo se
-- lee junto con ella y nunca al revés: no hace falta preguntar qué matrículas
-- tienen el concepto 7.
ALTER TABLE admin_escolar_matriculas
  ADD COLUMN IF NOT EXISTS conceptos_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill que reproduce EXACTAMENTE lo que hacía el devengo hasta hoy:
--   filtro viejo = concepto por defecto  OR  ya tiene algún cargo de esta matrícula
-- Así ninguna matrícula viva cambia de comportamiento al desplegar esto.
UPDATE admin_escolar_matriculas m
   SET conceptos_ids = COALESCE((
         SELECT jsonb_agg(DISTINCT c.id ORDER BY c.id)
           FROM admin_escolar_conceptos_pago c
          WHERE c.team_id = m.team_id
            AND (
              c.aplica_por_defecto
              OR EXISTS (
                SELECT 1 FROM admin_escolar_cargos g
                 WHERE g.matricula_id = m.id AND g.concepto_id = c.id
              )
            )
       ), '[]'::jsonb)
 WHERE m.conceptos_ids = '[]'::jsonb;

-- `aplica_por_defecto` queda en la tabla pero ya no lo lee nadie: se conserva
-- por si hay que rehacer el backfill. Se puede borrar en una migración futura.
