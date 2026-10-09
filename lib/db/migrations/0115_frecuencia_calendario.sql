-- El concepto deja de ser "se cobra todos los meses sí/no" y pasa a tener una
-- FRECUENCIA, y el calendario de cuotas deja de girar alrededor del
-- vencimiento para girar alrededor de la EMISIÓN.
--
-- El cambio de ancla es el importante. El colegio no decide "cuándo vence":
-- decide "el 28 sale la factura", y el vencimiento es una consecuencia de los
-- días que dé para pagar. Con la fecha guardada como vencimiento no había
-- forma de saber cuándo se emitía —había que restar y esperar que nadie
-- cambiara `dias_para_pago` después—, y los avisos "antes de emitir" que se
-- añadieron en 0113 quedaban colgando de un día que no existía en la tabla.
--
-- No cambia el comportamiento de lo que ya hay: la colegiatura del colegio
-- tiene `dias_para_pago = 0`, así que emisión y vencimiento son el mismo día y
-- las 10 cuotas de 2026-2027 siguen cayendo en las mismas fechas.

-- ─── 1. Frecuencia ──────────────────────────────────────────────────────────
-- `recurrente` solo sabía decir "cada mes" o "una vez". Los colegios
-- dominicanos también cobran por trimestre (los que siguen los cortes del
-- MINERD) y por semestre, y esos dos casos había que fingirlos a mano
-- sembrando filas en el calendario con SQL.
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS frecuencia varchar(12) NOT NULL DEFAULT 'unico';

-- El backfill va en EXECUTE porque nombra una columna que esta misma migración
-- elimina: escrito plano, la segunda pasada revienta al analizar la sentencia
-- aunque el WHERE de arriba fuera falso.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admin_escolar_conceptos_pago' AND column_name = 'recurrente') THEN
    EXECUTE 'UPDATE admin_escolar_conceptos_pago SET frecuencia = ''mensual'' WHERE recurrente = true';
    EXECUTE 'ALTER TABLE admin_escolar_conceptos_pago DROP COLUMN recurrente';
  END IF;
END $$;

ALTER TABLE admin_escolar_conceptos_pago
  DROP CONSTRAINT IF EXISTS admin_escolar_conceptos_frecuencia_valida;
ALTER TABLE admin_escolar_conceptos_pago
  ADD CONSTRAINT admin_escolar_conceptos_frecuencia_valida
  CHECK (frecuencia IN ('unico', 'mensual', 'trimestral', 'semestral'));

-- ─── 2. El día del mes es el de EMISIÓN, y va de 1 a 30 ─────────────────────
-- El 31 se cae: los meses de 30 días no lo tienen y había que decidir en el
-- momento si se adelantaba o se atrasaba. Con el tope en 30 el recorte es
-- siempre el mismo —febrero emite el 28, o el 29 en bisiesto— y se puede
-- explicar en una línea. El 0 ("último día del mes") desaparece por lo mismo:
-- era un valor mágico que significaba una fecha distinta cada mes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admin_escolar_conceptos_pago' AND column_name = 'dia_cobro') THEN
    ALTER TABLE admin_escolar_conceptos_pago RENAME COLUMN dia_cobro TO dia_emision;
  END IF;
END $$;

UPDATE admin_escolar_conceptos_pago SET dia_emision = 30
 WHERE dia_emision IS NOT NULL AND (dia_emision < 1 OR dia_emision > 30);

ALTER TABLE admin_escolar_conceptos_pago
  DROP CONSTRAINT IF EXISTS admin_escolar_conceptos_dia_emision_valido;
ALTER TABLE admin_escolar_conceptos_pago
  ADD CONSTRAINT admin_escolar_conceptos_dia_emision_valido
  CHECK (dia_emision IS NULL OR (dia_emision >= 1 AND dia_emision <= 30));

-- ─── 3. La fecha de la cuota es la de emisión ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admin_escolar_concepto_cuotas' AND column_name = 'fecha_vencimiento') THEN
    ALTER TABLE admin_escolar_concepto_cuotas RENAME COLUMN fecha_vencimiento TO fecha_emision;
  END IF;
END $$;

-- ─── 4. La mora entra el día que vence ──────────────────────────────────────
-- Los días de gracia eran un tercer número entre la emisión y el recargo que
-- nadie sabía leer: con vencimiento a 5 días y gracia de 3, el padre tenía 8
-- días y la pantalla decía 5. Si el colegio quiere dar más margen, sube
-- `dias_para_pago`, que es el número que el padre ve en su factura.
--
-- OJO: la empresa tiene su propio `teams.recargo_mora_dias_gracia` (default 5)
-- y el motor de recargo lo aplica cuando el plan no dice otra cosa. Quitar
-- esta columna NO significa "hereda los 5 del negocio": significa gracia cero.
-- Quien conecte el recargo escolar tiene que forzar 0 explícitamente.
ALTER TABLE admin_escolar_conceptos_pago DROP COLUMN IF EXISTS mora_dias_gracia;

-- ─── 5. De seis avisos a tres ───────────────────────────────────────────────
-- Seis casillas para tres momentos reales. "Antes de vencer", "el día que
-- vence" y "cuando ya está atrasado" se pisaban entre ellas —con vencimiento
-- el mismo día de la emisión, tres de las seis quedaban apagadas y sin sentido
-- posible— y los avisos de atraso no hacían pagar a nadie: para cuando salen,
-- el recargo ya está puesto. Quedan los tres que sí mueven al tutor: el que
-- avisa que viene, el que avisa que ya salió, y el que avisa que se le acaba
-- el plazo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admin_escolar_conceptos_pago' AND column_name = 'aviso_antes_mora_dias') THEN
    ALTER TABLE admin_escolar_conceptos_pago
      RENAME COLUMN aviso_antes_mora_dias TO aviso_antes_vencer_dias;
  END IF;
END $$;

-- El tercer aviso ahora se cuenta desde el VENCIMIENTO, no desde el día en que
-- entraba la mora. Lo que cambia según haya recargo o no es el texto del
-- mensaje ("se te acaba el plazo" vs "paga hoy para no pagar recargo"), nunca
-- la fecha: si dependiera del recargo, apagarlo movería el aviso de sitio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'admin_escolar_conceptos_pago' AND column_name = 'aviso_previo_dias') THEN
    EXECUTE 'UPDATE admin_escolar_conceptos_pago'
         || '   SET aviso_antes_vencer_dias = COALESCE(aviso_antes_vencer_dias, aviso_previo_dias)'
         || ' WHERE avisos_activos = true';
  END IF;
END $$;

ALTER TABLE admin_escolar_conceptos_pago
  DROP COLUMN IF EXISTS aviso_previo_dias,
  DROP COLUMN IF EXISTS aviso_dia_cobro,
  DROP COLUMN IF EXISTS aviso_vencido_dias;

-- ─── 6. Tercer canal: SMS ───────────────────────────────────────────────────
-- El ruteo de canal por aviso NO es configurable, va fijo en el código, y la
-- razón es de plataforma: WhatsApp solo deja escribir dentro de las 24 horas
-- siguientes a la última respuesta del tutor, así que el aviso del que depende
-- que el padre no pague recargo no puede salir por ahí. El SMS llega siempre
-- pero se paga por mensaje, así que se reserva justo para ese.
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS aviso_sms boolean NOT NULL DEFAULT false;

-- ─── 7. Descuento por saldar el año de una vez ──────────────────────────────
-- Es el descuento que los colegios ya dan por teléfono ("págame el año
-- completo y te rebajo un 5%") y que hoy se aplica a mano cambiando el monto
-- de la factura, sin que quede rastro de por qué.
--
-- NULL = no se ofrece. Solo tiene sentido cuando hay varias cuotas: en un pago
-- único no hay nada que adelantar.
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS descuento_adelanto_pct smallint;

ALTER TABLE admin_escolar_conceptos_pago
  DROP CONSTRAINT IF EXISTS admin_escolar_conceptos_descuento_valido;
ALTER TABLE admin_escolar_conceptos_pago
  ADD CONSTRAINT admin_escolar_conceptos_descuento_valido
  CHECK (descuento_adelanto_pct IS NULL
         OR (descuento_adelanto_pct >= 1 AND descuento_adelanto_pct <= 100));
