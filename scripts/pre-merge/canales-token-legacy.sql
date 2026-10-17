\set ON_ERROR_STOP on
\echo Esperado: con_token_plano = 0 y solo_plano = 0; con_token_cifrado puede ser mayor que 0
BEGIN TRANSACTION READ ONLY;
-- Resumen
SELECT
  count(*)                                                        AS canales,
  count(*) FILTER (WHERE COALESCE(config->>'token','') <> '')     AS con_token_plano,
  count(*) FILTER (WHERE COALESCE(config->>'tokenEncrypted','') <> '') AS con_token_cifrado,
  count(*) FILTER (WHERE COALESCE(config->>'token','') <> ''
                    AND COALESCE(config->>'tokenEncrypted','') = '')   AS solo_plano
FROM canales_whatsapp;

-- Detalle (sin imprimir el token)
SELECT id, org_id, nombre, activo,
       COALESCE(config->>'tokenEncrypted','') <> '' AS ya_cifrado,
       length(config->>'token') AS largo_token_plano
FROM canales_whatsapp
WHERE COALESCE(config->>'token','') <> ''
ORDER BY org_id, id;
COMMIT;
