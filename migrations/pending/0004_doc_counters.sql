-- ════════════════════════════════════════════════════════════════════════════
-- 0004 · Contadores de numeração de documentos (sem colisão entre PCs)
-- ESTADO: PREPARADA — NÃO APLICADA.
--
-- Está em migrations/pending/ de propósito: nem scripts/migrate.mjs (deploy) nem o
-- PGLite (src/lib/db.ts) descem a subpastas, por isso NÃO corre sozinha.
-- Para aplicar: mover para migrations/0004_doc_counters.sql e fazer deploy
-- (o build corre `npm run db:migrate`), ou correr manualmente na consola da Neon.
--
-- Enquanto não existir, o endpoint reserveDocNumbers devolve {ok:false, reason:"no-table"}
-- e os PCs usam a numeração offline com sufixo do dispositivo (ex.: FRM-2026-10-004-K7Q).
--
-- Uso (atómico, uma só instrução — ver src/lib/finance-cloud.ts → reserveDocNumbers):
--   INSERT INTO doc_counters (scope, value) VALUES ($scope, $floor + $n)
--   ON CONFLICT (scope) DO UPDATE
--     SET value = GREATEST(doc_counters.value, $floor) + $n, updated_at = NOW()
--   RETURNING value;      -- números reservados: value-n+1 … value
--
-- scope = PREFIXO-AAAA-MM  (FRM, CX, BAI, SOC, ENT, PROP …)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc_counters (
  scope      TEXT PRIMARY KEY CHECK (scope ~ '^[A-Z]{2,6}-[0-9]{4}-[0-9]{2}$'),
  value      BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semente opcional a partir do payload actual (maior NNN já emitido por âmbito),
-- para que o 1.º número reservado fique acima dos existentes mesmo sem `floor` do cliente.
-- (O cliente também envia `floor`, por isso isto é só uma rede de segurança.)
WITH nums AS (
  SELECT x->>'numero' AS n FROM finance_cloud, jsonb_array_elements(COALESCE(payload->'faturasPropina','[]'::jsonb)) x
  UNION ALL
  SELECT x->>'docInterno' FROM finance_cloud, jsonb_array_elements(COALESCE(payload->'extras','[]'::jsonb)) x
  UNION ALL
  SELECT x->>'id' FROM finance_cloud, jsonb_array_elements(COALESCE(payload->'extras','[]'::jsonb)) x
),
parsed AS (
  SELECT substring(n FROM '^([A-Z]{2,6}-[0-9]{4}-[0-9]{2})-[0-9]{3,}') AS scope,
         substring(n FROM '^[A-Z]{2,6}-[0-9]{4}-[0-9]{2}-([0-9]{3,})')::bigint AS seq
  FROM nums
  WHERE n ~ '^[A-Z]{2,6}-[0-9]{4}-[0-9]{2}-[0-9]{3,}'
)
INSERT INTO doc_counters (scope, value)
SELECT scope, MAX(seq) FROM parsed WHERE scope IS NOT NULL GROUP BY scope
ON CONFLICT (scope) DO UPDATE SET value = GREATEST(doc_counters.value, EXCLUDED.value);

-- Rollback:  DROP TABLE IF EXISTS doc_counters;   (os clientes voltam à numeração offline)
