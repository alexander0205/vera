-- 0200 · Conceptos: opcionales, precio por cuota, categoría propia y cuotas por tarifa.
--
-- Aditiva e idempotente. Con los valores por defecto ningún colegio cambia
-- hasta que toque la configuración.

-- Opcional: llega DESMARCADO al matricular y se marca solo a quien lo usa
-- (uniforme, transporte, almuerzo). Los obligatorios llegan marcados, que es
-- como llegan hoy todos. (`aplica_por_defecto` decía lo contrario, nadie lo
-- escribe desde que se quitó de la pantalla y casi todos lo tienen en false:
-- reutilizarlo dejaba a todos los colegios sin nada marcado.)
ALTER TABLE admin_escolar_conceptos_pago ADD COLUMN IF NOT EXISTS opcional BOOLEAN NOT NULL DEFAULT false;

-- Si el precio de Tarifas es lo de cada cuota (true) o el total del año que se
-- reparte (false). NULL = la regla de siempre: la colegiatura por cuota, lo
-- demás repartido (lib/administracion-escolar/repartir.ts, precioEsPorCuota).
ALTER TABLE admin_escolar_conceptos_pago ADD COLUMN IF NOT EXISTS precio_por_cuota BOOLEAN;

-- Categoría propia del colegio («Servicios», «Transporte», «Registro»…), para
-- clasificar y agrupar. Solo es un nombre: cómo se cobra lo dicen el tipo,
-- `precio_por_cuota`, la beca y la mora. NULL = la del tipo.
ALTER TABLE admin_escolar_conceptos_pago ADD COLUMN IF NOT EXISTS categoria VARCHAR(60);

-- Cuántas cuotas del calendario cobra esta tarifa: las primeras N. NULL = todas.
-- Maternal e Infantes pagan 11 meses y el resto 10 con el mismo concepto.
ALTER TABLE admin_escolar_concepto_precios ADD COLUMN IF NOT EXISTS cuotas SMALLINT;
