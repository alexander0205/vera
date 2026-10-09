-- Zero Tickets — reemplaza el inbox de soporte anterior (support_conversations/
-- support_messages). Sin datos reales de producción todavía: se dropean en vez
-- de migrarse. Si en el momento de correr esto ya hay tickets reales, PARAR y
-- migrar los datos a mano en vez de dropear.
DROP TABLE IF EXISTS support_messages;
DROP TABLE IF EXISTS support_conversations;

CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_agent_id INTEGER REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'esperando', -- esperando | abierto | cerrado
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_read_by_user_at TIMESTAMP,
  last_read_by_agent_at TIMESTAMP,
  user_typing_until TIMESTAMP,
  agent_typing_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL, -- user | agent | system
  sender_id INTEGER REFERENCES users(id),
  message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text | screenshot_request
  content TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_attachments (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  kind VARCHAR(10) NOT NULL, -- image | video | file
  storage VARCHAR(10) NOT NULL, -- s3 | db
  s3_key VARCHAR(500),
  data_base64 TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX tickets_team_id_idx ON tickets(team_id);
CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX ticket_messages_ticket_id_idx ON ticket_messages(ticket_id);
CREATE INDEX ticket_attachments_message_id_idx ON ticket_attachments(message_id);
