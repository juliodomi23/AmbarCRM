-- Actualizaciones idempotentes para bases nuevas y existentes.
-- Este archivo se ejecuta con el usuario dueño en cada deploy.

ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_nombre TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_logo TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_primario TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_color_acento TEXT;
ALTER TABLE ajustes ADD COLUMN IF NOT EXISTS marca_preset TEXT;

-- Motivo legible cuando Meta rechaza un mensaje (se muestra en el chat).
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS error_detalle TEXT;

-- Solo WhatsApp Cloud API oficial de Meta.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'proveedor_canal' AND e.enumlabel <> 'cloud_api'
  ) THEN
    UPDATE canales_whatsapp
    SET activo = false, estado = 'desconectado'
    WHERE proveedor::text <> 'cloud_api';

    ALTER TYPE proveedor_canal RENAME TO proveedor_canal_old;
    CREATE TYPE proveedor_canal AS ENUM ('cloud_api');
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor DROP DEFAULT;
    ALTER TABLE canales_whatsapp
      ALTER COLUMN proveedor TYPE proveedor_canal USING 'cloud_api'::proveedor_canal;
    ALTER TABLE canales_whatsapp ALTER COLUMN proveedor SET DEFAULT 'cloud_api';
    DROP TYPE proveedor_canal_old;
  END IF;
END $$;

-- Un phone_number_id de Meta solo puede estar activo en una organización.
CREATE UNIQUE INDEX IF NOT EXISTS canales_whatsapp_phone_number_id_activo_uq
  ON canales_whatsapp ((config->>'phoneNumberId'))
  WHERE activo AND config->>'phoneNumberId' IS NOT NULL;

CREATE OR REPLACE FUNCTION resolve_org_by_phone(p_phone text)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT org_id FROM canales_whatsapp
    WHERE activo AND proveedor = 'cloud_api'
      AND (config->>'phoneNumberId' = p_phone OR instancia = p_phone)
    ORDER BY id DESC LIMIT 1
$$;
