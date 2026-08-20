-- El documento va por CUENTA, no por colegio.
--
-- Una cuenta puede estar a nombre del colegio (su RNC) y otra a nombre de la
-- fundación o del dueño (otro RNC, o una cédula). El padre teclea ese documento
-- en la app del banco al registrar el beneficiario: si le damos el del colegio
-- para una cuenta que está a nombre de la fundación, el banco le rebota la
-- transferencia y llama al colegio a preguntar qué pasó.
--
-- El de `admin_escolar_datos_pago` NO se borra: se queda como el que heredan las
-- cuentas que no digan otro. Lo normal es que las tres sean del mismo colegio, y
-- obligar a escribir el mismo RNC tres veces son tres sitios donde equivocarse.

ALTER TABLE admin_escolar_cuentas_banco
  ADD COLUMN IF NOT EXISTS documento varchar(20);

-- Las que ya existen se quedan con el del colegio, escrito ya en la fila: si
-- mañana cambia el del colegio, el de una cuenta concreta no debería moverse
-- solo.
UPDATE admin_escolar_cuentas_banco c
SET documento = d.documento
FROM admin_escolar_datos_pago d
WHERE d.team_id = c.team_id AND c.documento IS NULL AND d.documento IS NOT NULL;
