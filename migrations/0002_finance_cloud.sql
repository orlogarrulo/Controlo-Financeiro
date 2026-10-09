-- Estado financeiro partilhado (JSON) — sincronização multi-dispositivo
CREATE TABLE IF NOT EXISTS finance_cloud (
  id TEXT PRIMARY KEY DEFAULT 'escola',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO finance_cloud (id, payload, updated_at)
VALUES ('escola', '{}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
