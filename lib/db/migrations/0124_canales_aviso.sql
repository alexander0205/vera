-- Interruptor maestro de cada canal de aviso, por colegio.
--
-- Los conceptos ya deciden QUÉ se avisa y por dónde (`aviso_correo`,
-- `aviso_whatsapp`, `aviso_sms`), pero no había forma de callar un canal
-- entero: para dejar de mandar correos había que entrar concepto por concepto
-- y apagarlos uno a uno, y volver a encenderlos después de la misma manera.
--
-- La fila puede no existir: eso significa los tres encendidos. Así no hace
-- falta rellenar nada para los colegios que ya están, y un colegio nuevo se
-- comporta igual que antes de esta tabla.
CREATE TABLE IF NOT EXISTS admin_escolar_canales (
  team_id         INTEGER PRIMARY KEY REFERENCES teams(id),
  correo_activo   BOOLEAN NOT NULL DEFAULT true,
  whatsapp_activo BOOLEAN NOT NULL DEFAULT true,
  sms_activo      BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);
