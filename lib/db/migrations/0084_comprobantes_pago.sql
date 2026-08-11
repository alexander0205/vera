-- Comprobantes de pago: archivos (imagen/PDF) que respaldan un cobro.
--
-- El adjunto cuelga del DOCUMENTO, no de la fila del ledger. Razón: las filas de
-- pagos_recibidos no son estables — /api/facturas/[id]/pago borra y reinserta el
-- pago completo en cada guardado, y registrarPagoFacturaConMora parte un pago en
-- varias filas (factura + cada ND de mora). Atarlo solo a pago_recibido_id
-- perdería el archivo. pago_recibido_id queda como referencia fina, con
-- ON DELETE SET NULL para que el comprobante sobreviva a esas reescrituras.
--
-- El binario vive en S3 (bucket zero-comprobantes-pago, privado). `contenido`
-- es el fallback base64 para desarrollo local sin credenciales de AWS.

CREATE TABLE IF NOT EXISTS "pago_adjuntos" (
  "id"               serial PRIMARY KEY,
  "team_id"          integer NOT NULL REFERENCES "teams"("id"),
  "ecf_document_id"  integer NOT NULL REFERENCES "ecf_documents"("id"),
  "pago_recibido_id" integer REFERENCES "pagos_recibidos"("id") ON DELETE SET NULL,
  "nombre"           varchar(255) NOT NULL,
  "mime"             varchar(100) NOT NULL,
  "tamano_bytes"     integer NOT NULL,
  "sha256"           char(64) NOT NULL,
  -- 's3' → el binario está en s3_key. 'db' → está en contenido (base64).
  "storage"          varchar(10) NOT NULL DEFAULT 's3',
  "s3_key"           text,
  -- Miniatura (~300px) derivada del binario ya guardado. Objeto aparte para que
  -- las galerías no descarguen el original completo solo para pintar 70px.
  -- NULL en PDF (se muestra un ícono).
  "thumb_s3_key"     text,
  "contenido"        text,
  "subido_por"       integer REFERENCES "users"("id"),
  "created_at"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pago_adjuntos_doc_idx"
  ON "pago_adjuntos" ("team_id", "ecf_document_id");
CREATE INDEX IF NOT EXISTS "pago_adjuntos_pago_idx"
  ON "pago_adjuntos" ("pago_recibido_id");

-- El mismo archivo no se guarda dos veces en la misma factura. La garantía va
-- acá y no en un SELECT previo: con dos subidas simultáneas del mismo
-- comprobante, ambas ven la tabla vacía y ambas insertan.
CREATE UNIQUE INDEX IF NOT EXISTS "pago_adjuntos_sha_uq"
  ON "pago_adjuntos" ("team_id", "ecf_document_id", "sha256");

-- Config por empresa: métodos de pago que EXIGEN comprobante adjunto. Mismo
-- patrón que metodos_obliga_dgii. Array de valores de METODO_PAGO_VALUES.
-- Vacío = sin restricción (comportamiento actual, nadie cambia de flujo).
ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "metodos_exige_comprobante" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Permiso para borrar un comprobante ya subido (destructivo: es evidencia de un
-- cobro). Se siembra solo a owner y admin, igual que se hizo con
-- facturas:precio-editar en 0082. Subir NO lleva permiso propio: usa el mismo
-- gate que registrar el pago (facturas:crear).
INSERT INTO "team_role_permissions" ("team_role_id", "permission")
SELECT tr.id, 'pagos:adjunto-eliminar'
FROM "team_roles" tr
WHERE tr.key IN ('owner', 'admin')
ON CONFLICT ("team_role_id", "permission") DO NOTHING;
