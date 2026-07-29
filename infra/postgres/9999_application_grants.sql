-- Grant restricted application role the minimum privileges needed at runtime.
-- Run as the PostgreSQL superuser after Kysely migrations are applied.
-- The application role (ttp_app) must already exist (created during VPS
-- provisioning).
--
-- Graphile Worker manages its own dedicated `graphile_worker` schema. It enables
-- row-level security on its `_private_*` tables with no policies, which denies
-- access to non-owners. The worker connects as ttp_app, so ttp_app must OWN
-- the graphile_worker schema and its objects (owners bypass RLS unless
-- FORCE ROW LEVEL SECURITY is set, which graphile-worker does not set). On a
-- restore from a dump, the objects are owned by postgres, so ownership is
-- transferred here. On a fresh deploy, `CREATE SCHEMA ... AUTHORIZATION ttp_app`
-- makes ttp_app the schema owner up front, and the worker creates its tables
-- as ttp_app.

GRANT CONNECT ON DATABASE tt_players TO ttp_app;

-- Pre-create the worker schema owned by ttp_app (no-op if it already exists).
CREATE SCHEMA IF NOT EXISTS graphile_worker AUTHORIZATION ttp_app;

GRANT USAGE ON SCHEMA public TO ttp_app;
GRANT USAGE ON SCHEMA staging TO ttp_app;
GRANT USAGE, CREATE ON SCHEMA graphile_worker TO ttp_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ttp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA staging TO ttp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA graphile_worker TO ttp_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ttp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA staging TO ttp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA graphile_worker TO ttp_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ttp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ttp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphile_worker
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ttp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ttp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging
  GRANT USAGE, SELECT ON SEQUENCES TO ttp_app;

-- Transfer ownership of graphile_worker objects to ttp_app so the worker
-- (running as ttp_app) bypasses RLS on the _private_* tables. No-op on a fresh
-- deploy where ttp_app already owns them; fixes objects restored from a dump.
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
    EXECUTE 'ALTER SCHEMA graphile_worker OWNER TO ttp_app';
    FOR r IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'graphile_worker' AND c.relkind IN ('r', 'v', 'm', 'p')
    LOOP
      EXECUTE format('ALTER TABLE graphile_worker.%I OWNER TO ttp_app', r.relname);
    END LOOP;
  END IF;
END $$;