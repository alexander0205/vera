-- Cuánto se tarda en hacer una factura, medido de verdad.
--
-- Hasta ahora el argumento comercial —«se van 75 horas al mes en cobrar»— eran
-- minutos estimados sobre volumen real. Esto sustituye la estimación por
-- medición: el reloj arranca cuando se abre el formulario y se para cuando se
-- guarda, y queda por dónde se hizo.
--
-- LO QUE MIDE, y hay que leerlo así: tiempo de pared, no de trabajo. Incluye
-- que alguien se levante por un café a mitad de una factura. Por eso lo que
-- vale es la MEDIANA, no el promedio: cuatro facturas de dos minutos y una que
-- quedó abierta toda la tarde dan un promedio que no describe a nadie.

CREATE TABLE IF NOT EXISTS factura_tiempos (
  id               serial PRIMARY KEY,
  team_id          integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id          integer REFERENCES users(id) ON DELETE SET NULL,
  ecf_document_id  integer,
  -- 'escolar' (el cajón del colegio) | 'formulario' | 'pos' | 'recurrente'
  origen           varchar(24) NOT NULL,
  ms               integer NOT NULL,
  lineas           smallint NOT NULL DEFAULT 0,
  monto_centavos   bigint,
  emitida          boolean NOT NULL DEFAULT false,
  created_at       timestamp NOT NULL DEFAULT now()
);

-- Las dos preguntas que se van a hacer: «cuánto tarda este colegio» y
-- «cuánto tarda por dónde se hace».
CREATE INDEX IF NOT EXISTS factura_tiempos_team_fecha_idx
  ON factura_tiempos (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS factura_tiempos_origen_idx
  ON factura_tiempos (origen, created_at DESC);
