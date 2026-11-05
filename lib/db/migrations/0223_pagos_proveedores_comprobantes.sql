-- 0223 · Comprobante de la transferencia adjunto a un pago a proveedor.
--
-- Al pagar una factura a crédito se puede adjuntar el PDF o la foto del
-- comprobante del banco. Respalda el pago y su asiento, y deja a mano el id de
-- transacción y la referencia para conciliar con el estado de cuenta.
--
--   · Un comprobante por pago (UNIQUE pago_id): adjuntar otro reemplaza el anterior.
--   · `lectura_ia` es lo que la IA leyó (monto, impuesto del banco, fecha,
--     referencia) más su confianza. Es una PROPUESTA que la persona confirmó o
--     corrigió: no cambia el pago ni el asiento. NULL = no se leyó.
--   · El binario sigue las mismas reglas que los demás comprobantes: S3 privado
--     (storage = 's3') o base64 en la propia fila sin credenciales ('db'); nunca
--     presigned URLs, se sirve por una ruta con sesión y empresa.
--
-- Tabla aparte, y no columnas en pagos_proveedores, para no tocar una tabla que
-- se lee en cada pantalla de cuentas por pagar. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS pagos_proveedores_comprobantes (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  pago_id        INTEGER NOT NULL REFERENCES pagos_proveedores(id) ON DELETE CASCADE,
  archivo_nombre VARCHAR(255),
  mime           VARCHAR(100) NOT NULL,
  tamano_bytes   INTEGER NOT NULL,
  sha256         VARCHAR(64) NOT NULL,
  storage        VARCHAR(10) NOT NULL DEFAULT 's3',
  s3_key         VARCHAR(255),
  contenido      TEXT,
  lectura_ia     JSONB,
  lectura_ia_en  TIMESTAMP,
  subido_por     INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pagos_prov_comp_storage_chk CHECK (storage IN ('s3', 'db'))
);
CREATE UNIQUE INDEX IF NOT EXISTS pagos_prov_comp_pago_uniq ON pagos_proveedores_comprobantes (pago_id);
CREATE INDEX IF NOT EXISTS pagos_prov_comp_team_idx ON pagos_proveedores_comprobantes (team_id);
-- La misma foto subida a dos pagos distintos de la empresa es casi siempre un error.
CREATE INDEX IF NOT EXISTS pagos_prov_comp_hash_idx ON pagos_proveedores_comprobantes (team_id, sha256);
