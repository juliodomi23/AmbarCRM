# Canales · fase 0

`channel/types.ts` exige teléfono y limita el proveedor a `cloud_api`; `index.ts` solo construye Cloud API. `cloudapi.ts` normaliza WhatsApp/Coexistence y envía texto, media y plantillas. `ingest.ts` identifica contactos por teléfono, exige Cloud API y usa teléfono para bienvenida, horario y dispatch al bot; comparte contactos, conversaciones, CSAT, leads, bot y notificaciones. El trigger SQL de mensajes alimenta SSE. `wa/webhook/` existe vacío: la entrada vigente es `meta/webhook/route.ts`.

Sin sesión, Meta resuelve empresa con `resolve_org_by_phone` (SECURITY DEFINER); después `runWithOrg` y `db` fijan `app.current_org` por transacción y RLS limita las operaciones. La firma global o del canal se comprueba antes de procesar. Los nuevos webhooks conservarán ese límite: resolución mínima, autenticación y operaciones dentro del tenant.

`bot-auth.ts` resuelve la empresa por token con SECURITY DEFINER y `conBot` aplica límites, permisos y `runWithOrg`; `botAutorizado` restringe el canal. `services/bots.ts` conserva el evento compatible `message_created`, firma V1/V2, etiquetas `bot_off`, handoff y auditoría. Su sender presupone teléfono. La ruta `messages` conserva notas y bitácora pero exige teléfono y Cloud API para responder. No cambiaremos su contrato HTTP.

Archivos previstos (rutas desde la raíz; las llaves enumeran nombres exactos):

- `schema.sql`, `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`.
- `web/src/lib/channel/{types,index,api,messenger,destinatario}.ts`.
- `web/src/lib/services/{ingest,bots,canales}.ts`.
- `web/src/lib/{canal-api-auth,api-webhook}.ts`.
- `web/src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route.ts`.
- `web/src/app/api/{canal-api/[canalId]/mensajes,messenger/webhook,canales,canales/[id]}/route.ts`.
- `web/src/app/api/mensajes/enviar/route.ts`, `web/src/proxy.ts` (solo exclusión de nuevos webhooks).
- `web/src/components/config/{Canales,CanalExterno,ConfiguracionCliente}.tsx`, `web/src/lib/services/config.ts`.
- `web/src/components/chat/{ChatCliente,IconoCanal}.tsx`, `web/src/app/(app)/chat/page.tsx`, `web/src/app/api/conversaciones/route.ts`.
- `web/src/app/api/meta/webhook/route.ts` (acuses acotados al canal).
- `web/prisma/scripts/test-canales-{base,api,messenger}.ts`, `web/scripts/check-canales-ui.ts`.
- `docs/{canales-fase-0,canales-decisiones,canal-api,despliegue-bot,canales-validacion}.md`.

Validación por fase: TypeScript, build, pruebas específicas, aislamiento y seguridad, con BD desechable `ambarcrm-canales-prueba` en `127.0.0.1:55450`, creada exclusivamente con schema SQL, multi-tenant y actualizaciones. Sin push, deploy, Meta real ni producción.
