-- Migration 0004: Add extra fields to ecf_documents
ALTER TABLE "ecf_documents"
  ADD COLUMN IF NOT EXISTS "total_retenciones" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notas" text,
  ADD COLUMN IF NOT EXISTS "terminos_condiciones" text,
  ADD COLUMN IF NOT EXISTS "pie_factura" text,
  ADD COLUMN IF NOT EXISTS "retenciones" text,
  ADD COLUMN IF NOT EXISTS "comentario" text,
  ADD COLUMN IF NOT EXISTS "pago_recibido" varchar(5) DEFAULT 'false',
  ADD COLUMN IF NOT EXISTS "pago_metodo" varchar(30),
  ADD COLUMN IF NOT EXISTS "pago_cuenta" varchar(100),
  ADD COLUMN IF NOT EXISTS "pago_valor_cts" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pago_fecha" varchar(10);
