-- =============================================================================
-- Limpieza de estructura académica duplicada/basura — Colegio Andrés Bello
-- (team_id = 9), servicios "Primaria" (id 9) y "sds" (id 3).
--
-- CONTEXTO (ver docs/estructura-duplicada.md para el detalle completo):
--   El equipo tiene 7 servicios en admin_escolar_servicios. Los 4 que están
--   sincronizados con SIGERD (sigerd_servicio_id IS NOT NULL) y pertenecen al
--   período activo "2026-2027" (periodo_id = 1) son la estructura REAL:
--     Bachillerato Académico..., Inicial, Primario, Secundario
--   (Secundario ya tiene 1 matrícula real con 1 estudiante — NO TOCAR.)
--
--   Los otros 3 servicios NO tienen sigerd_servicio_id y cuelgan del período
--   "2025-2026" que ya está marcado activo = false:
--     Kinder (id 8), Primaria (id 9), sds (id 3)
--   Los tres están COMPLETAMENTE VACÍOS de matrículas (0 estudiantes reales).
--   "sds" además tiene nombre/tanda/grado literalmente basura de pruebas
--   ("sds", "sdsd", "Gradi primaria").
--
--   Es decir: "Primaria" y "Primario" NO son dos servicios con datos en
--   conflicto que haya que fusionar — "Primaria" está vacío. Es sobrante de
--   antes de la sincronización SIGERD, bajo un período ya retirado. La
--   corrección correcta no es una fusión (MERGE/UPDATE de matrículas), es
--   retirar el sobrante vacío. Igual con "sds", que es basura de pruebas.
--
--   ¡OJO! Si en el futuro se decide reactivar el período "2025-2026" con
--   datos reales, este análisis quedaría obsoleto. Por eso el paso 0 de abajo
--   vuelve a verificar en caliente que los conteos siguen en cero antes de
--   borrar nada.
--
-- ESTA ES UNA PROPUESTA. NO SE HA EJECUTADO. Un humano debe:
--   1. Confirmar que "Primaria" (id 9) y "Kinder" (id 8) en el período
--      2025-2026 no se van a usar (¿se re-crearán ya con nombres correctos
--      cuando se abra matrícula en ese período, o el período mismo se va a
--      borrar/archivar?).
--   2. Decidir si prefiere DESACTIVAR (reversible, no borra nada) o BORRAR
--      (limpio pero requiere estar seguro). Este script deja ambas opciones;
--      por defecto solo aplica la opción reversible (desactivar).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 0 — Verificación de seguridad (abortar si algo cambió desde el análisis)
-- -----------------------------------------------------------------------------
-- Si cualquiera de estas dos filas no da 0, el asunto ya no es "servicio
-- vacío" y este script NO debe continuar (hay que investigar de nuevo).
DO $$
DECLARE
  matriculas_primaria int;
  matriculas_sds int;
BEGIN
  SELECT COUNT(*) INTO matriculas_primaria
  FROM admin_escolar_matriculas m
  JOIN admin_escolar_cursos c ON c.id = m.curso_id
  JOIN admin_escolar_grados g ON g.id = c.grado_id
  WHERE g.servicio_id = 9; -- Primaria

  SELECT COUNT(*) INTO matriculas_sds
  FROM admin_escolar_matriculas m
  JOIN admin_escolar_cursos c ON c.id = m.curso_id
  JOIN admin_escolar_grados g ON g.id = c.grado_id
  WHERE g.servicio_id = 3; -- sds

  IF matriculas_primaria <> 0 OR matriculas_sds <> 0 THEN
    RAISE EXCEPTION 'Hay matrículas reales bajo Primaria (id 9) o sds (id 3). NO continuar sin revisar a mano. primaria=%, sds=%', matriculas_primaria, matriculas_sds;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- OPCIÓN A (recomendada, reversible) — Desactivar en vez de borrar
-- -----------------------------------------------------------------------------
-- No borra nada. Solo apaga los servicios/grados/secciones para que dejen de
-- aparecer en los selectores de la UI (asumiendo que las pantallas filtran
-- por `activo = true`, como hace el resto del módulo escolar). Totalmente
-- reversible con un UPDATE inverso.

-- "Primaria" (id 9) — vacío, sin sigerd_servicio_id, período ya inactivo.
UPDATE admin_escolar_servicios SET activo = false WHERE id = 9 AND team_id = 9;

-- "sds" (id 3) — basura de pruebas (tanda 'sdsd', grado 'Gradi primaria').
UPDATE admin_escolar_servicios SET activo = false WHERE id = 3 AND team_id = 9;
UPDATE admin_escolar_grados SET activo = false WHERE servicio_id = 3;
UPDATE admin_escolar_cursos SET activo = false
  WHERE grado_id IN (SELECT id FROM admin_escolar_grados WHERE servicio_id = 3);

-- Opcional: también "Kinder" (id 8) cae en la misma categoría (vacío, sin
-- sigerd_servicio_id, período inactivo) aunque no se pidió explícitamente.
-- Descomentar si el humano confirma que también es sobrante:
-- UPDATE admin_escolar_servicios SET activo = false WHERE id = 8 AND team_id = 9;

-- -----------------------------------------------------------------------------
-- OPCIÓN B (destructiva, NO reversible sin backup) — Borrado físico
-- -----------------------------------------------------------------------------
-- Dejar COMENTADA hasta que el humano decida que quiere borrar en vez de
-- desactivar. Requiere borrar en orden hijo→padre por las FK (sin ON DELETE
-- CASCADE en este esquema): cursos → grados → servicio.
--
-- -- "sds" (id 3):
-- DELETE FROM admin_escolar_cursos
--   WHERE grado_id IN (SELECT id FROM admin_escolar_grados WHERE servicio_id = 3);
-- DELETE FROM admin_escolar_grados WHERE servicio_id = 3;
-- DELETE FROM admin_escolar_servicios WHERE id = 3 AND team_id = 9;
--
-- -- "Primaria" (id 9) — no tiene grados/cursos, el DELETE del servicio basta:
-- DELETE FROM admin_escolar_servicios WHERE id = 9 AND team_id = 9;

-- -----------------------------------------------------------------------------
-- PASO FINAL — Revisar el resultado ANTES de hacer COMMIT
-- -----------------------------------------------------------------------------
SELECT id, nombre, tanda, periodo_id, activo, sigerd_servicio_id
FROM admin_escolar_servicios
WHERE team_id = 9
ORDER BY nombre;

-- Si el resultado de arriba se ve como se espera: COMMIT;
-- Si algo se ve mal: ROLLBACK;
-- (Este script NO decide por ti — termina aquí a propósito, sin COMMIT ni
--  ROLLBACK explícito, para que sea el humano quien lo escriba después de
--  mirar el SELECT.)
