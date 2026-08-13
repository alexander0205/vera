-- Credenciales de SIGERD por colegio, para reconectar solo.
--
-- Hasta ahora la contraseña no se guardaba en ningún sitio a propósito: la
-- sesión vivía 30 minutos en una cookie cifrada y, al caducar, el usuario la
-- volvía a teclear. Eso sirve para consultar; no sirve para migrar.
--
-- Traer los 465 expedientes son ~1.860 llamadas al portal y unos 25 minutos.
-- La sesión del MINERD dura menos que eso, así que sin reconexión automática
-- la importación muere siempre a la mitad. Guardar la contraseña no es una
-- comodidad: es lo que hace posible el proceso.
--
-- LO QUE ESTO CUESTA: hoy una brecha de base de datos no da acceso a SIGERD
-- porque no hay nada que robar. A partir de aquí, quien consiga la base Y la
-- llave de cifrado entra al portal como el colegio. La llave vive en las
-- variables de entorno, nunca en la base — misma postura que los certificados
-- fiscales— y son las dos piezas juntas las que hacen falta.

CREATE TABLE IF NOT EXISTS sigerd_credenciales (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),

  /** Cédula con la que se entra. No es secreta: el portal la pide a la vista. */
  usuario      VARCHAR(20) NOT NULL,

  -- La contraseña, en las tres piezas de AES-256-GCM. Separadas y no en un solo
  -- blob para que se vea de un vistazo que hay authTag: sin él, el descifrado
  -- no detecta que alguien tocó el ciphertext.
  clave_cifrada TEXT NOT NULL,
  clave_iv      VARCHAR(32) NOT NULL,
  clave_tag     VARCHAR(32) NOT NULL,

  /** Perfil elegido cuando el usuario pertenece a varios centros. */
  id_centro    INTEGER,
  centro_nombre VARCHAR(200),

  /** Última vez que el portal aceptó estas credenciales. */
  verificado_en TIMESTAMP,
  /** Motivo del último fallo, para poder decirle al colegio qué pasó. */
  ultimo_error  VARCHAR(300),

  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Una sola por colegio: dos juegos de credenciales para el mismo centro solo
-- sirven para que la mitad de las importaciones use el caducado.
CREATE UNIQUE INDEX IF NOT EXISTS sigerd_credenciales_team_uniq
  ON sigerd_credenciales (team_id);

-- El pariente que trae SIGERD tiene su propio id de persona, y es mejor llave
-- que la cédula: la cédula viene con guiones, sin ellos, o sencillamente mal
-- escrita, y entonces la misma madre se duplica cada año que se importa.
ALTER TABLE admin_escolar_tutores
  ADD COLUMN IF NOT EXISTS sigerd_id_persona INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_tutores_sigerd_uniq
  ON admin_escolar_tutores (team_id, sigerd_id_persona)
  WHERE sigerd_id_persona IS NOT NULL;
