-- Tipo de orden del POS: cómo se despacha lo que se cobró.
--
-- Dato OPERATIVO, no fiscal — no entra al XML de la DGII ni afecta el e-CF. Sirve
-- para el historial de recibos del POS: permite filtrar "comer aquí" vs "para
-- llevar" como en cualquier POS de restaurante (touch pos plus, etc.).
--
-- Nullable a propósito: las ventas viejas, las que no vienen del POS y los tickets
-- sin-ncf de demo quedan en NULL sin romper nada. El selector del POS solo ofrece
-- 'comer-aqui' cuando la orden tiene mesa (comanda); las ventas rápidas sin mesa
-- usan 'mostrador' / 'para-llevar' / 'delivery'.
ALTER TABLE "ecf_documents"
  ADD COLUMN IF NOT EXISTS "tipo_orden" varchar(20);
--> statement-breakpoint

ALTER TABLE "ecf_documents"
  ADD CONSTRAINT "ecf_documents_tipo_orden_chk" CHECK (
    "tipo_orden" IS NULL
    OR "tipo_orden" IN ('comer-aqui', 'para-llevar', 'delivery', 'mostrador')
  );
