-- Migration: 0029_row_audit_log
-- Captura cada INSERT/UPDATE/DELETE de las business tables en row_audit_log.
-- Atribución de usuario/team/IP via SET LOCAL en cada request (ver lib/db/audit-context.ts).

-- ─── 1. Tabla de auditoría ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS row_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  table_name    TEXT        NOT NULL,
  row_pk        TEXT,
  operation     CHAR(1)     NOT NULL CHECK (operation IN ('I','U','D')),
  old_data      JSONB,
  new_data      JSONB,
  changed_cols  TEXT[],
  user_id       INTEGER,
  team_id       INTEGER,
  actor         TEXT,
  ip_address    VARCHAR(45),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS row_audit_log_table_idx    ON row_audit_log(table_name);
CREATE INDEX IF NOT EXISTS row_audit_log_table_pk_idx ON row_audit_log(table_name, row_pk);
CREATE INDEX IF NOT EXISTS row_audit_log_user_idx     ON row_audit_log(user_id);
CREATE INDEX IF NOT EXISTS row_audit_log_team_idx     ON row_audit_log(team_id);
CREATE INDEX IF NOT EXISTS row_audit_log_changed_idx  ON row_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS row_audit_log_op_idx       ON row_audit_log(operation);

-- ─── 2. Redacción de columnas sensibles ──────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_redact_sensitive(p_table TEXT, p_data JSONB)
RETURNS JSONB AS $$
BEGIN
  IF p_data IS NULL THEN RETURN NULL; END IF;
  IF p_table = 'users' THEN
    RETURN p_data - 'password_hash' - 'two_factor_secret';
  ELSIF p_table = 'api_keys' THEN
    RETURN p_data - 'key_hash';
  END IF;
  RETURN p_data;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 3. Función de trigger genérica ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_trigger_func() RETURNS TRIGGER AS $$
DECLARE
  v_user_id  INTEGER;
  v_team_id  INTEGER;
  v_actor    TEXT;
  v_ip       VARCHAR(45);
  v_old      JSONB;
  v_new      JSONB;
  v_pk       TEXT;
  v_cols     TEXT[];
BEGIN
  -- Contexto de request (SET LOCAL). NULL si no se setea.
  BEGIN v_user_id := NULLIF(current_setting('app.user_id', true), '')::INTEGER;
  EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;

  v_actor := NULLIF(current_setting('app.actor', true), '');
  v_ip    := NULLIF(current_setting('app.ip',    true), '');

  IF TG_OP = 'DELETE' THEN
    v_old := audit_redact_sensitive(TG_TABLE_NAME, to_jsonb(OLD));
    v_pk  := v_old->>'id';
    v_team_id := COALESCE(
      NULLIF(current_setting('app.team_id', true), '')::INTEGER,
      (v_old->>'team_id')::INTEGER
    );
    INSERT INTO row_audit_log(table_name,row_pk,operation,old_data,new_data,changed_cols,user_id,team_id,actor,ip_address)
    VALUES (TG_TABLE_NAME, v_pk, 'D', v_old, NULL, NULL, v_user_id, v_team_id, v_actor, v_ip);
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := audit_redact_sensitive(TG_TABLE_NAME, to_jsonb(OLD));
    v_new := audit_redact_sensitive(TG_TABLE_NAME, to_jsonb(NEW));
    v_pk  := v_new->>'id';
    v_team_id := COALESCE(
      NULLIF(current_setting('app.team_id', true), '')::INTEGER,
      (v_new->>'team_id')::INTEGER
    );

    -- Calcular columnas que cambiaron (ignora no-ops).
    SELECT array_agg(key ORDER BY key)
      INTO v_cols
      FROM jsonb_each(v_new) n
     WHERE n.value IS DISTINCT FROM (v_old -> n.key);

    IF v_cols IS NULL OR array_length(v_cols, 1) = 0 THEN
      RETURN NEW;  -- nada cambió realmente
    END IF;

    INSERT INTO row_audit_log(table_name,row_pk,operation,old_data,new_data,changed_cols,user_id,team_id,actor,ip_address)
    VALUES (TG_TABLE_NAME, v_pk, 'U', v_old, v_new, v_cols, v_user_id, v_team_id, v_actor, v_ip);
    RETURN NEW;

  ELSIF TG_OP = 'INSERT' THEN
    v_new := audit_redact_sensitive(TG_TABLE_NAME, to_jsonb(NEW));
    v_pk  := v_new->>'id';
    v_team_id := COALESCE(
      NULLIF(current_setting('app.team_id', true), '')::INTEGER,
      (v_new->>'team_id')::INTEGER
    );
    INSERT INTO row_audit_log(table_name,row_pk,operation,old_data,new_data,changed_cols,user_id,team_id,actor,ip_address)
    VALUES (TG_TABLE_NAME, v_pk, 'I', NULL, v_new, NULL, v_user_id, v_team_id, v_actor, v_ip);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Adjuntar trigger a business tables ───────────────────────────────────
-- Excluidas: activity_logs, system_logs, audit_logs, row_audit_log (evita recursión).
--             rate_limits, password_reset_tokens, email_verification_tokens (ephemeras).
--             dgii_catalogos, dgii_catalogos_sync_log, rnc_padron (datos de referencia).

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users',
    'teams',
    'team_members',
    'invitations',
    'clients',
    'products',
    'sequences',
    'ecf_documents',
    'ecf_documents_recibidos',
    'categorias',
    'cotizaciones',
    'facturas_recurrentes',
    'pagos_recibidos',
    'almacenes',
    'vendedores',
    'listas_precios',
    'listas_precios_items',
    'payments',
    'api_keys',
    'outbound_webhooks',
    'system_settings',
    'impresoras'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Solo si la tabla existe (defensivo — system_settings/impresoras pueden no haberse creado).
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger_func()',
        t
      );
    END IF;
  END LOOP;
END $$;
