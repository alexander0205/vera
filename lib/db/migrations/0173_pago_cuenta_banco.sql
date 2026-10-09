-- A qué CUENTA de la empresa entró un cobro, por referencia y no por texto.
--
-- `pagos_recibidos.cuenta` seguía siendo texto libre: guardaba la etiqueta que
-- se veía el día del cobro. Eso congela el nombre —renombrar la cuenta deja el
-- historial con el nombre viejo— y obliga a agrupar reportes comparando
-- cadenas, que es como se acaba con «BHD», «Banco BHD» y «bhd» contados aparte.
--
-- La columna de texto NO se toca ni se migra:
--
--   * En producción hay 809 transferencias, y las 9 que llevan banco lo llevan
--     como slug suelto («bhd», «popular», «banreservas») que no corresponde a
--     ninguna fila de `admin_escolar_cuentas_banco`. Adivinar a cuál se referían
--     sería inventar historial contable.
--   * Sigue haciendo falta para lo que no es una cuenta de la empresa: «Caja
--     general», «Otro», y las empresas que aún no han cargado sus cuentas.
--
-- Así que conviven: `cuenta_banco_id` cuando se eligió una cuenta real —y manda
-- para agrupar—, `cuenta` como lo que se le enseñó al usuario.
--
-- ON DELETE SET NULL a propósito: borrar una cuenta no puede borrar el cobro ni
-- bloquear el borrado. El cobro sobrevive con su etiqueta en `cuenta`.

ALTER TABLE pagos_recibidos
  ADD COLUMN IF NOT EXISTS cuenta_banco_id integer
    REFERENCES admin_escolar_cuentas_banco(id) ON DELETE SET NULL;

-- Para «cuánto entró por esta cuenta»: casi todas las filas son NULL (efectivo,
-- tarjeta, histórico), así que el índice parcial es una fracción del total.
CREATE INDEX IF NOT EXISTS idx_pagos_recibidos_cuenta_banco
  ON pagos_recibidos (cuenta_banco_id)
  WHERE cuenta_banco_id IS NOT NULL;
