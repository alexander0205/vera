-- 0171 · Catálogo de compras (artículos/servicios que el negocio COMPRA)
-- Simétrico a `products` (catálogo de venta) pero separado: en gasto/compra
-- el buscador NO debe ofrecer lo que vendes. No toca inventario/stock.
-- Numerada 0171 a propósito: va DESPUÉS de nómina (0156–0170), que se mergea
-- primero. Aditiva → segura en la DB compartida.

CREATE TABLE IF NOT EXISTS catalogo_compras (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  nombre           VARCHAR(255) NOT NULL,
  descripcion      TEXT,
  referencia       VARCHAR(100),
  costo_cents      INTEGER NOT NULL DEFAULT 0,
  tasa_itbis       VARCHAR(8) NOT NULL DEFAULT '0.18',
  proveedor_nombre VARCHAR(255),
  proveedor_rnc    VARCHAR(20),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Búsqueda por equipo + nombre/referencia (lo que hace el picker).
CREATE INDEX IF NOT EXISTS idx_catalogo_compras_team ON catalogo_compras(team_id);
