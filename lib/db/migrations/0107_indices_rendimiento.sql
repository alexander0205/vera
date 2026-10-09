-- Índices que faltaban en las consultas calientes.
--
-- Salen de cruzar los WHERE/JOIN/ORDER BY que se ejecutan en cada carga de
-- pantalla contra los índices que había. Las tablas escolares están casi vacías
-- hoy, así que nada de esto se nota todavía: un colegio real tiene 465
-- estudiantes y ~5.100 cargos al año, y con veinte colegios los mismos SELECT
-- pasan a recorrer decenas de miles de filas y a ordenarlas en memoria.
--
-- Va todo con CONCURRENTLY para poder aplicarlo en producción sin bloquear
-- escrituras. Eso obliga a ejecutarlo fuera de transacción: si se corre con
-- psql -f, cada sentencia va suelta y funciona.

-- ── Estudiantes ─────────────────────────────────────────────────────────────

-- El listado ordena por apellidos y nombres; sin esto se ordena la tabla
-- completa en memoria en cada página.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_estudiantes_team_orden_idx
  ON admin_escolar_estudiantes (team_id, apellidos, nombres);
--> statement-breakpoint

-- El buscador hace ILIKE '%texto%', que ningún índice normal puede servir. Con
-- trigramas sí, y aquí importa porque la consulta se dispara en cada tecla.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_estudiantes_nombres_trgm_idx
  ON admin_escolar_estudiantes USING gin (nombres gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_estudiantes_apellidos_trgm_idx
  ON admin_escolar_estudiantes USING gin (apellidos gin_trgm_ops);
--> statement-breakpoint

-- Búsqueda por código: la usan el sync de Sigerd, el enriquecimiento de fichas
-- y la generación del próximo código.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_estudiantes_team_codigo_idx
  ON admin_escolar_estudiantes (team_id, codigo);
--> statement-breakpoint

-- ── Cargos ─────────────────────────────────────────────────────────────────

-- La reconciliación de saldos arranca buscando los documentos ya facturados, y
-- corre en cada carga del listado de estudiantes. Es el índice que más se paga.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_cargos_team_factura_idx
  ON admin_escolar_cargos (team_id, ecf_document_id)
  WHERE ecf_document_id IS NOT NULL;
--> statement-breakpoint

-- Listado de cargos: filtra por período y estado, y ordena por año y mes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_cargos_listado_idx
  ON admin_escolar_cargos (team_id, periodo_id, anio DESC, mes DESC, id DESC);
--> statement-breakpoint

-- Deuda de un estudiante, que se pide en su ficha y en la cartera.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_cargos_team_est_estado_idx
  ON admin_escolar_cargos (team_id, estudiante_id, estado);
--> statement-breakpoint

-- Evita duplicar el cargo de un mes al generar las cuotas dos veces.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_cargos_matricula_periodo_idx
  ON admin_escolar_cargos (matricula_id, anio, mes);
--> statement-breakpoint

-- ── Matrículas ─────────────────────────────────────────────────────────────

-- No había ningún índice con curso_id, y se consulta para saber si una sección
-- tiene alumnos (antes de borrarla) y para listar por período.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_matriculas_team_curso_estado_idx
  ON admin_escolar_matriculas (team_id, curso_id, estado);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_matriculas_team_periodo_estado_idx
  ON admin_escolar_matriculas (team_id, periodo_id, estado);
--> statement-breakpoint

-- ── Responsable de pago ────────────────────────────────────────────────────

-- Parcial porque solo interesan los tutores que pagan, que son una minoría de
-- las filas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_est_tutor_resp_idx
  ON admin_escolar_estudiante_tutores (team_id, estudiante_id)
  WHERE responsable_pago;
--> statement-breakpoint

-- ── Pagos ──────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_pagos_team_est_fecha_idx
  ON admin_escolar_pagos (team_id, estudiante_id, fecha_pago DESC);
--> statement-breakpoint

-- ── Estructura académica ───────────────────────────────────────────────────

-- Los reconciliadores del sync buscan por nombre dentro del padre.
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_cursos_team_nombre_nivel_idx
  ON admin_escolar_cursos (team_id, nombre, nivel);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_grados_team_servicio_idx
  ON admin_escolar_grados (team_id, servicio_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_escolar_servicios_team_periodo_idx
  ON admin_escolar_servicios (team_id, periodo_id);
--> statement-breakpoint

-- ── Snapshot de Sigerd ─────────────────────────────────────────────────────

-- Los dos lectores piden el último snapshot del colegio: el índice único por
-- (team_id, ano_academico) no sirve para ordenar por fecha.
CREATE INDEX CONCURRENTLY IF NOT EXISTS sigerd_importaciones_team_updated_idx
  ON sigerd_importaciones (team_id, updated_at DESC);
--> statement-breakpoint

-- ── Personal ───────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS sigerd_personal_team_orden_idx
  ON sigerd_personal (team_id, apellidos, nombres);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS escolar_personal_team_orden_idx
  ON escolar_personal (team_id, apellidos, nombres);
--> statement-breakpoint

-- ── Fuera del módulo escolar ───────────────────────────────────────────────

-- `products` no tenía NINGÚN índice por team_id, y el catálogo se lista en
-- Facturación y en el punto de venta ordenado por nombre. Afecta a todas las
-- empresas, no solo a los colegios.
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_team_nombre_idx
  ON products (team_id, nombre);
--> statement-breakpoint

-- La búsqueda de la nota de crédito que anula una factura se ejecuta una vez
-- por factura durante la reconciliación de saldos.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ecf_docs_nc_origen_idx
  ON ecf_documents (team_id, origen_documento_id)
  WHERE tipo_ecf = '34' AND credito_generado_cents IS NULL;
