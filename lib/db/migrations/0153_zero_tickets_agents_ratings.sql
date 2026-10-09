-- Zero Tickets — agentes desacoplados de admin, ratings de tickets,
-- respuestas predeterminadas, y estado "en espera" para tickets.

CREATE TABLE support_agents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX support_agents_user_id_idx ON support_agents(user_id);

CREATE TABLE ticket_ratings (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES users(id),
  rating INTEGER NOT NULL, -- 1 a 5
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ticket_ratings_agent_id_idx ON ticket_ratings(agent_id);

CREATE TABLE canned_responses (
  id SERIAL PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'general', -- saludo | espera | cierre | general
  content TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT FALSE;
