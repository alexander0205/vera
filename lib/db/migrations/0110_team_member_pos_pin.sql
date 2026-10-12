-- PIN de autorización del POS por miembro de equipo.
-- Un supervisor (admin/owner) configura su PIN (4–6 dígitos) para autorizar que
-- un cajero quite un ítem de un recibo ya cobrado (pos:quitar-item-pin).
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pos_pin varchar(6);
