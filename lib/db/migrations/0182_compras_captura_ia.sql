-- Compras · captura por foto con IA (link permanente del negocio).
--
-- Un negocio genera UN enlace sin vencimiento, revocable. Quien lo abre ve una
-- cámara, fotografía la factura del proveedor y Zero la interpreta (QR de la DGII
-- primero; si no hay, un modelo de visión). El resultado NO entra a los libros:
-- cae como «captura pendiente» que alguien con sesión revisa y registra desde la
-- pantalla de compras normal. El enlace es público y sin sesión, así que jamás
-- postea contabilidad solo.
--
-- Aditiva e idempotente: se corre a mano con psql.
--
-- NOTA MERGE: roles-adicionales tomó la 0181 (subió primero). Este es 0182.
-- La 0181 de fix/sigerd-candado-idcentro deberá renumerar a 0183 cuando suba.

-- ─── El enlace permanente del negocio ────────────────────────────────────────
-- Uno por equipo (unique team_id). «Regenerar» = reemplazar el token en la misma
-- fila: el token viejo deja de resolver al instante, sin filas huérfanas.
CREATE TABLE IF NOT EXISTS compras_captura_links (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Única credencial de la página: largo y aleatorio (randomBytes base64url).
  token          VARCHAR(48) NOT NULL UNIQUE,
  -- abierto | revocado
  estado         VARCHAR(20) NOT NULL DEFAULT 'abierto',
  ultimo_acceso  TIMESTAMP,
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS compras_captura_links_team_uq ON compras_captura_links(team_id);

-- ─── Cada foto enviada por el enlace ─────────────────────────────────────────
-- Vive como borrador hasta que alguien la registra (o la descarta). `extraido`
-- guarda el JSON tal como lo devolvió QR/IA; las columnas sueltas (rnc, ncf,
-- total) son para listar y detectar duplicados sin abrir el JSON.
CREATE TABLE IF NOT EXISTS compras_capturas (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  link_id        INTEGER NOT NULL REFERENCES compras_captura_links(id) ON DELETE CASCADE,
  -- Ref de la foto: `s3:<key>` o `data:image/...;base64,...` (fallback sin S3).
  foto_ref       TEXT NOT NULL,
  -- qr | ia — de dónde salieron los datos.
  origen         VARCHAR(10) NOT NULL,
  -- pendiente | registrada | descartada
  estado         VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  -- Borrador extraído (proveedor, ncf, fecha, líneas, montos…).
  extraido       JSONB,
  -- Desnormalizados para el listado y el dedup.
  proveedor_rnc  VARCHAR(20),
  ncf            VARCHAR(19),
  total_cents    BIGINT,
  -- La compra que salió de esta captura, si se registró.
  compra_id      INTEGER REFERENCES compras_locales(id) ON DELETE SET NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compras_capturas_team_estado_idx ON compras_capturas(team_id, estado);
-- Avisar «esta factura ya la registraste» sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS compras_capturas_dedup_idx ON compras_capturas(team_id, proveedor_rnc, ncf);
