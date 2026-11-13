CREATE TABLE IF NOT EXISTS notificaciones (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT NOT NULL DEFAULT NULLIF(current_setting('app.current_org', true), '')::bigint,
  usuario_id  BIGINT NOT NULL,
  titulo      TEXT NOT NULL,
  cuerpo      TEXT,
  enlace      TEXT,
  leida_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notificaciones_org_id_usuario_id_leida_at_created_at_idx
  ON notificaciones (org_id, usuario_id, leida_at, created_at);
