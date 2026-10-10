# Canales con token de Meta sin cifrar (`config.token`)

Solo lectura: esto **no se ejecutó** contra ninguna base. Córrelo tú, con el rol dueño y de preferencia
en una réplica o fuera de horario.

El código que acepta el token viejo está en `web/src/lib/meta/credentials.ts:40-43`
(`tokenFromChannelConfig`). Cuando existe `config.tokenEncrypted` se usa ese y se ignora `config.token`.

## 1. Verificar

```sql
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
```

## 2. Plan si hay filas

1. **Respaldo** de `canales_whatsapp` antes de tocar nada.
2. Filas con ambos campos (`ya_cifrado = true`): el token plano es un sobrante.
   `UPDATE canales_whatsapp SET config = config - 'token' WHERE config ? 'tokenEncrypted' AND config ? 'token';`
3. Filas **solo con token plano**: cifrar con `encryptMetaToken` usando la `META_TOKEN_ENCRYPTION_KEY` de
   producción (script de una sola vez, una transacción por fila):
   `UPDATE … SET config = (config - 'token') || jsonb_build_object('tokenEncrypted', <valor encv1:…>)`.
   Verificar descifrando (`decryptMetaToken`) y mandando un mensaje de prueba por ese canal.
   Alternativa sin script: reconectar el canal con Embedded Signup, que ya guarda cifrado.
4. Repetir la consulta de resumen: `con_token_plano` debe ser 0.
5. Rotar el token en Meta si los respaldos de la base o los logs anteriores no son de confianza: el
   valor en claro quedó en esos respaldos.
6. Con 0 filas, abrir un PR que quite el respaldo de `credentials.ts:40-43` y `config.token` en
   `web/src/lib/services/config.ts:31`.
