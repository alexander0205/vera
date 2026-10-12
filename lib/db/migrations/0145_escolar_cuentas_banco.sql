-- Varias cuentas por colegio, un solo contacto.
--
-- Un colegio cobra por más de un banco: el padre que tiene Popular no quiere
-- pagar comisión de transferencia interbancaria a un BHD, así que se le ofrecen
-- las dos y elige la suya. Con una sola cuenta, la mitad de las familias paga de
-- más o no paga.
--
-- Lo que NO se multiplica: el teléfono de ayuda y el documento (RNC o cédula).
-- Esos son del colegio, no de la cuenta, y repetirlos por fila sería tres
-- oportunidades de que uno quede mal escrito.
--
-- El titular SÍ va por cuenta: una puede estar a nombre del colegio y otra a
-- nombre de la fundación, y el padre necesita saber a quién le está mandando
-- dinero antes de mandarlo.

CREATE TABLE IF NOT EXISTS admin_escolar_cuentas_banco (
  id             serial PRIMARY KEY,
  team_id        integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  banco          varchar(120) NOT NULL,
  tipo_cuenta    varchar(40),
  numero_cuenta  varchar(60)  NOT NULL,
  titular        varchar(200),
  -- En qué orden se le enseñan al padre. La primera es la que más se usa.
  orden          smallint     NOT NULL DEFAULT 0,
  -- Se apaga en vez de borrarse: una cuenta cerrada sigue apareciendo en
  -- comprobantes viejos y borrarla dejaría al colegio sin saber qué es ese
  -- número cuando revise un pago de hace tres meses.
  activa         boolean      NOT NULL DEFAULT true,
  creado_en      timestamp    NOT NULL DEFAULT now(),
  actualizado_en timestamp    NOT NULL DEFAULT now()
);

-- La misma cuenta dos veces es un error de dedo, no una cuenta más.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_cuentas_banco_uq
  ON admin_escolar_cuentas_banco (team_id, banco, numero_cuenta);
CREATE INDEX IF NOT EXISTS admin_escolar_cuentas_banco_team_idx
  ON admin_escolar_cuentas_banco (team_id, activa, orden);

-- La cuenta que ya estaba configurada se muda a la tabla nueva. Sin esto, el
-- colegio que ya la llenó vería su enlace de pago sin datos de un día para otro.
--
-- Detrás de un IF y con EXECUTE porque la mudanza solo tiene sentido la primera
-- vez: en la segunda, `banco` ya no existe en la tabla de origen y hasta parsear
-- la consulta falla. Estas migraciones se corren a mano, de una en una, y
-- repetir una es cuestión de subir dos veces la misma flecha.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'admin_escolar_datos_pago' AND column_name = 'banco'
  ) THEN
    EXECUTE $mudanza$
      INSERT INTO admin_escolar_cuentas_banco
             (team_id, banco, tipo_cuenta, numero_cuenta, titular, orden)
      SELECT team_id, banco, tipo_cuenta, numero_cuenta, titular, 0
        FROM admin_escolar_datos_pago
       WHERE banco IS NOT NULL AND numero_cuenta IS NOT NULL
      ON CONFLICT DO NOTHING
    $mudanza$;
  END IF;
END $$;

ALTER TABLE admin_escolar_datos_pago
  DROP COLUMN IF EXISTS banco,
  DROP COLUMN IF EXISTS tipo_cuenta,
  DROP COLUMN IF EXISTS numero_cuenta,
  DROP COLUMN IF EXISTS titular;

-- `rnc` pasa a llamarse `documento`: un colegio grande da su RNC, pero uno
-- pequeño que cobra a nombre de su dueño da una cédula. Es el mismo campo y el
-- nombre viejo obligaba a mentir en la mitad de los casos.
--
-- Envuelto: `RENAME COLUMN` es lo único de este archivo que NO se puede repetir
-- —revienta si ya se renombró— y estas migraciones se corren a mano, de una en
-- una, donde repetir una es cuestión de subir dos veces la misma flecha.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'admin_escolar_datos_pago' AND column_name = 'rnc'
  ) THEN
    ALTER TABLE admin_escolar_datos_pago RENAME COLUMN rnc TO documento;
  END IF;
END $$;
