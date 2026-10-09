-- Varias fotos por documento, y enlaces que apuntan a UN documento.
--
-- Dos cambios que van juntos porque responden al mismo caso: el padre abre el
-- enlace del acta de nacimiento y le hace dos fotos, una por cara.
--
-- 1) Hasta ahora `admin_escolar_documentos_entregados` guardaba EL archivo en
--    sus propias columnas, con un índice único (matricula_id, requerido_id).
--    Eso permite un archivo por documento. El acta tiene dos caras y la tarjeta
--    de vacunas varias páginas.
--
--    La fila de `entregados` se queda como el ESTADO del requisito —quién lo
--    aprobó y cuándo, si no aplica y por qué— y los binarios se van a una tabla
--    hija. Así el rastro de la aprobación no se duplica por archivo: se aprueba
--    el documento, no cada foto.
--
-- 2) `admin_escolar_documentos_enlaces` era por matrícula. Sigue valiendo —un
--    enlace para todo el expediente— pero ahora puede acotarse a un requisito
--    concreto con `requerido_id`. NULL = el expediente entero.

CREATE TABLE IF NOT EXISTS admin_escolar_documento_archivos (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  entregado_id   INTEGER NOT NULL REFERENCES admin_escolar_documentos_entregados(id) ON DELETE CASCADE,

  archivo_nombre VARCHAR(255),
  mime           VARCHAR(100) NOT NULL,
  tamano_bytes   INTEGER NOT NULL,
  sha256         CHAR(64) NOT NULL,
  -- 's3' o 'db' (base64), igual que pago_adjuntos: en local sin credenciales
  -- de S3 el binario cae a Postgres y la pantalla se puede probar igual.
  storage        VARCHAR(10) NOT NULL,
  s3_key         TEXT,
  contenido      TEXT,

  -- Para ordenarlos: "cara 1", "cara 2". El padre los sube en el orden en que
  -- los fotografía y ese orden es el que tiene sentido al revisarlos.
  orden          SMALLINT NOT NULL DEFAULT 0,

  subido_en      TIMESTAMP NOT NULL DEFAULT NOW(),
  subido_por     INTEGER REFERENCES users(id),
  -- TRUE si entró por el enlace de la familia. `subido_por` va NULL ahí: no hay
  -- sesión, y atribuirlo a un empleado sería mentir en el rastro.
  subido_familia BOOLEAN NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_escolar_doc_archivos_entregado_idx
  ON admin_escolar_documento_archivos (entregado_id, orden);
-- El mismo binario no se guarda dos veces en el mismo documento: el padre que
-- dispara dos veces sin querer no debe generar dos filas idénticas.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_doc_archivos_sha_uniq
  ON admin_escolar_documento_archivos (entregado_id, sha256);


-- Traslada lo que ya está guardado en la fila de `entregados` a la tabla nueva.
-- Sin esto, los documentos subidos hasta hoy desaparecerían de la pantalla.
INSERT INTO admin_escolar_documento_archivos
  (team_id, entregado_id, archivo_nombre, mime, tamano_bytes, sha256,
   storage, s3_key, contenido, orden, subido_en, subido_por, subido_familia)
SELECT team_id, id, archivo_nombre, mime, tamano_bytes, sha256,
       storage, s3_key, contenido, 0, COALESCE(subido_en, NOW()), subido_por, subido_familia
FROM admin_escolar_documentos_entregados
WHERE storage IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admin_escolar_documento_archivos a WHERE a.entregado_id = admin_escolar_documentos_entregados.id
  );

-- Las columnas viejas NO se borran todavía: el código aún las lee, y quitarlas
-- ahora dejaría la pantalla en blanco entre el despliegue y el siguiente. Se
-- eliminan en una migración posterior, cuando nadie las use.
COMMENT ON COLUMN admin_escolar_documentos_entregados.s3_key IS
  'OBSOLETA: el binario vive en admin_escolar_documento_archivos. Pendiente de borrar.';


-- Enlace acotado a un documento concreto. NULL = el expediente entero.
ALTER TABLE admin_escolar_documentos_enlaces
  ADD COLUMN IF NOT EXISTS requerido_id INTEGER
    REFERENCES admin_escolar_documentos_requeridos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS admin_escolar_docs_enlace_requerido_idx
  ON admin_escolar_documentos_enlaces (requerido_id);
