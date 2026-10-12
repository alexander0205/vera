-- Los dos avisos que giran alrededor de la EMISIÓN, no del vencimiento.
--
-- El colegio no piensa en "días antes de vencer": piensa "el 28 se genera la
-- factura y cinco días antes le aviso". El ancla es el día en que sale la
-- factura, que es el que el colegio decide y el que el padre reconoce. Con
-- solo `aviso_previo_dias` (que cuenta hacia atrás desde el vencimiento) ese
-- calendario no se podía escribir cuando el vencimiento cae días después.

ALTER TABLE admin_escolar_conceptos_pago
  -- Días antes de emitir en que se avisa: "se acerca tu factura de septiembre".
  ADD COLUMN IF NOT EXISTS aviso_antes_emision_dias smallint,
  -- Avisar el mismo día que sale la factura: "ya se generó, tienes que pagar".
  ADD COLUMN IF NOT EXISTS aviso_dia_emision boolean NOT NULL DEFAULT false;

-- Lo que ya avisaba antes de vencer pasa a avisar también al emitir: es el
-- aviso que el colegio da por descontado y nadie iba a ir a marcarlo.
UPDATE admin_escolar_conceptos_pago
   SET aviso_dia_emision = true,
       aviso_antes_emision_dias = COALESCE(aviso_antes_emision_dias, aviso_previo_dias)
 WHERE avisos_activos = true;
