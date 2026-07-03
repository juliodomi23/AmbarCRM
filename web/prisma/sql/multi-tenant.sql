-- ============================================================================
-- AmbarCRM · Migración a multi-tenant (BD compartida + org_id + RLS)
-- Ver MULTI-TENANT.md. Corre esto en psql conectado como el DUEÑO/superusuario.
--
-- REGLA DE ORO: la app NO debe conectarse como el dueño/superusuario, sino como
-- `crm_app` (rol sin BYPASSRLS). Si la app usa el dueño, RLS se ignora y NO hay
-- aislamiento. Cambia DATABASE_URL a crm_app al final.
--
-- Orden recomendado:
--   · Deploy NUEVO (BD vacía): `npx prisma db push`  →  luego PARTE B y C.
--   · BD EXISTENTE (con datos del cliente actual):    PARTE A  →  PARTE B  →  PARTE C.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE A — Solo BD EXISTENTE: crear orgs, añadir org_id y backfillear a la org 1.
-- (En deploy nuevo esto lo hace `prisma db push`; sáltate la PARTE A.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id         BIGSERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO orgs (id, nombre, slug)
  VALUES (1, 'Cliente Inicial', 'inicial')
  ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuarios','embudos','etapas','contactos','etiquetas','contacto_etiquetas',
    'oportunidades','canales_whatsapp','grupos','mensajes_grupo','bots',
    'conversaciones','mensajes','plantillas_mensaje','notas','tareas','ajustes','eventos'
  ] LOOP
    -- añadir columna (nullable), backfill a org 1, fijar NOT NULL + DEFAULT por contexto
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS org_id BIGINT', t);
    EXECUTE format('UPDATE %I SET org_id = 1 WHERE org_id IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN org_id SET NOT NULL', t);
    EXECUTE format($q$ALTER TABLE %I ALTER COLUMN org_id
      SET DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint$q$, t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES orgs(id)',
      t, t || '_org_fk');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (org_id)', t || '_org_idx', t);
  END LOOP;
END $$;

-- Reemplazar las UNIQUE globales por compuestas con org_id (dos tenants pueden repetir).
ALTER TABLE usuarios  DROP CONSTRAINT IF EXISTS usuarios_email_key;
ALTER TABLE usuarios  ADD CONSTRAINT usuarios_org_email_key UNIQUE (org_id, email);
ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_telefono_key;
ALTER TABLE contactos ADD CONSTRAINT contactos_org_telefono_key UNIQUE (org_id, telefono);
ALTER TABLE etiquetas DROP CONSTRAINT IF EXISTS etiquetas_nombre_key;
ALTER TABLE etiquetas ADD CONSTRAINT etiquetas_org_nombre_key UNIQUE (org_id, nombre);
ALTER TABLE grupos    DROP CONSTRAINT IF EXISTS grupos_jid_key;
ALTER TABLE grupos    ADD CONSTRAINT grupos_org_jid_key UNIQUE (org_id, jid);
ALTER TABLE ajustes   ADD CONSTRAINT ajustes_org_key UNIQUE (org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE B — SIEMPRE: activar RLS + política de aislamiento por tabla.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuarios','embudos','etapas','contactos','etiquetas','contacto_etiquetas',
    'oportunidades','canales_whatsapp','grupos','mensajes_grupo','bots',
    'conversaciones','mensajes','plantillas_mensaje','notas','tareas','ajustes','eventos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY org_isolation ON %I
      USING      (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
    $p$, t);
  END LOOP;
END $$;

-- Funciones de resolución cruzada (sin contexto de tenant). SECURITY DEFINER:
-- corren como el dueño (que no está forzado por RLS) y por eso pueden leer entre orgs.
-- Se usan SOLO para enrutar: webhook (phone_number_id/canal) y bots (token).
CREATE OR REPLACE FUNCTION resolve_org_by_canal(p_id bigint)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp WHERE id = p_id
$$;
CREATE OR REPLACE FUNCTION resolve_org_by_phone(p_phone text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp WHERE config->>'phoneNumberId' = p_phone LIMIT 1
$$;
CREATE OR REPLACE FUNCTION resolve_org_by_bot_token(p_token text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM bots WHERE api_token = p_token
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE C — SIEMPRE: rol de la app (sometido a RLS) y permisos.
-- ⚠️ Pon una contraseña real y usa este rol en DATABASE_URL.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO crm_app;
-- que los objetos futuros (migraciones nuevas) también queden con permiso
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO crm_app;

-- NOTA: `crm_app` NO es dueño de las tablas y NO tiene BYPASSRLS → respeta RLS. Correcto.
-- Mantén un rol aparte (el dueño/superusuario) para correr migraciones y Prisma.

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE D — Realtime multi-tenant: el NOTIFY incluye org_id para que el SSE
-- solo reenvíe eventos del tenant de la sesión. (Idempotente; en BD existentes
-- correr solo este bloque basta.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_notify_mensaje() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('nuevo_mensaje', json_build_object(
    'conversacion_id', NEW.conversacion_id,
    'mensaje_id',      NEW.id,
    'direccion',       NEW.direccion,
    'org_id',          NEW.org_id
  )::text);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE E — Tablas nuevas (2026-07): mensajes programados y suscripciones push.
-- Nacen multi-tenant (org_id + RLS). Idempotente: correr en BD nuevas y existentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensajes_programados (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id          BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  conversacion_id BIGINT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  contenido       TEXT   NOT NULL,
  enviar_at       TIMESTAMPTZ NOT NULL,
  estado          TEXT   NOT NULL DEFAULT 'pendiente',  -- pendiente | enviado | fallido | cancelado
  creado_por      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_programados_estado_enviar_at_idx ON mensajes_programados(estado, enviar_at);
CREATE INDEX IF NOT EXISTS mensajes_programados_org_idx ON mensajes_programados(org_id);

CREATE TABLE IF NOT EXISTS push_suscripciones (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id     BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint REFERENCES orgs(id),
  usuario_id BIGINT,
  endpoint   TEXT   NOT NULL UNIQUE,
  p256dh     TEXT   NOT NULL,
  auth       TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_suscripciones_org_idx ON push_suscripciones(org_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mensajes_programados','push_suscripciones'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY org_isolation ON %I
      USING      (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)
    $p$, t);
  END LOOP;
END $$;

-- crm_app hereda permisos por los DEFAULT PRIVILEGES de la PARTE C; por si esta parte
-- se corre en una BD donde aún no existían, se los damos explícitos:
GRANT SELECT, INSERT, UPDATE, DELETE ON mensajes_programados, push_suscripciones TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
