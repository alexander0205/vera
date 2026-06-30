-- POS — Fase 3: productos favoritos del punto de venta.
-- Los favoritos se muestran primero en la grilla para acceso rápido.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "pos_favorito" boolean NOT NULL DEFAULT false;
