-- Integración escolar ↔ facturación (Fase 8, pasos 3-4).
-- Dos enlaces OPCIONALES al catálogo/facturación existente. Ambos nullable:
-- no rompen datos previos y el módulo escolar sigue funcionando sin ellos.
--
--   1) admin_escolar_conceptos_pago.product_id → products.id
--      Un concepto (ej. "Mensualidad") puede apuntar a un producto/servicio ya
--      existente. La factura generada desde el cargo hereda nombre/ITBIS del
--      producto — evita duplicar catálogo. El monto sigue viniendo del cargo.
--
--   2) admin_escolar_cargos.ecf_document_id → ecf_documents.id
--      Factura (e-CF) que cubre el cargo. El cargo sigue siendo la fuente de
--      verdad de la deuda (saldo_centavos); la factura es el documento fiscal.
--      Muchos cargos pueden apuntar a una misma factura.
--
-- Idempotente: IF NOT EXISTS en ambas columnas.

ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);

ALTER TABLE admin_escolar_cargos
  ADD COLUMN IF NOT EXISTS ecf_document_id INTEGER REFERENCES ecf_documents(id);
