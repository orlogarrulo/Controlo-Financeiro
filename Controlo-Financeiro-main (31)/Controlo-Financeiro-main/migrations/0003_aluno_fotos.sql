-- Fotos dos alunos em tabela própria (fora do JSON finance_cloud)
-- Permite sincronização multi-dispositivo sem estourar o payload JSON.
CREATE TABLE IF NOT EXISTS aluno_fotos (
  id TEXT PRIMARY KEY,
  data_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aluno_fotos_updated ON aluno_fotos (updated_at DESC);
