-- 0217 · Cobros «de migración»: los que llegaron con la factura histórica.
--
-- Una factura histórica (estado HISTORICA) es una deuda traída de otro sistema
-- (Alegra, un Excel). Lo que ya se había cobrado allá entra a Zero como cobros
-- de la factura, para que la cartera muestre el saldo correcto. Ese dinero ya
-- está en los libros del sistema anterior: si contabilidad lo asentara, el banco
-- subiría con plata vieja y Cuentas por cobrar quedaría negativa, porque la
-- factura histórica no abre deuda como una venta del período.
--
-- La columna dice cuáles son. Los marca solo el sistema (importador de facturas
-- y «Cuenta histórica»); los cobros que se registran en Zero quedan en false.
--
-- Solo agrega: el código de antes no lee la columna. Se corre ANTES de desplegar,
-- porque el código nuevo sí la lee.

ALTER TABLE pagos_recibidos
  ADD COLUMN IF NOT EXISTS de_migracion boolean NOT NULL DEFAULT false;

-- Los que ya existen. Tres orígenes conocidos, todos sobre facturas históricas:
--  · el importador de facturas por CSV («Cobrada al importar …»),
--  · la pantalla de cuenta histórica («Pago previo …»),
--  · las cargas a mano desde Alegra: sin usuario y con «Alegra» en la nota.
-- Un cobro con link de pago o comprobante también puede quedar sin usuario,
-- pero nunca lleva «Alegra» en la nota.
UPDATE pagos_recibidos p
   SET de_migracion = true
  FROM ecf_documents d
 WHERE d.id = p.ecf_document_id
   AND d.team_id = p.team_id
   AND d.estado = 'HISTORICA'
   AND p.de_migracion = false
   AND (
         p.notas LIKE 'Cobrada al importar%'
      OR p.notas = 'Pago previo (importado con cuenta histórica)'
      OR (p.created_by IS NULL AND p.notas ILIKE '%alegra%')
   );
