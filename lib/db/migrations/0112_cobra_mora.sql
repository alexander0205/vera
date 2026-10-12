-- Si el concepto cobra recargo por atraso, dicho explícitamente.
--
-- Hacía falta una columna propia porque `mora_dias_gracia` en nulo ya
-- significa otra cosa: el motor de mora lo lee como "usa los días de gracia de
-- la empresa" (lib/cobranza/recargo.ts), no como "a este no le cobres". Sin
-- este interruptor no había forma de decir que un concepto no lleva recargo.
--
-- El vencimiento no necesita columna: `dias_para_pago` en nulo ya es "no
-- vence", y no hay ningún otro significado compitiendo por ese hueco.

ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS cobra_mora boolean NOT NULL DEFAULT false;

-- Lo que ya tenía días de gracia puestos es porque alguien quería cobrar mora.
UPDATE admin_escolar_conceptos_pago
   SET cobra_mora = true
 WHERE mora_dias_gracia IS NOT NULL;
