# Despliegue de AmbarCRM

## 1. Requisitos

- Dominio público con HTTPS.
- PostgreSQL.
- Aplicación de Meta tipo Business con el producto WhatsApp.
- Negocio verificado y acceso a Embedded Signup para Tech Provider.
- Node.js compatible con Next.js 16 o Docker.

## 2. Variables obligatorias

```env
DATABASE_URL=postgresql://usuario:password@postgres:5432/ambar_crm
NEXTAUTH_URL=https://crm.tudominio.com
NEXTAUTH_SECRET=<secreto-largo>
API_KEY=<secreto-para-integraciones-internas>

META_APP_ID=<app-id>
META_APP_SECRET=<app-secret>
META_WEBHOOK_VERIFY_TOKEN=<secreto-aleatorio>
META_GRAPH_VERSION=v26.0
META_TOKEN_ENCRYPTION_KEY=<32-bytes-en-base64>

NEXT_PUBLIC_META_APP_ID=<app-id>
NEXT_PUBLIC_META_CONFIG_ID=<configuration-id-de-embedded-signup>
NEXT_PUBLIC_META_GRAPH_VERSION=v26.0

LEGAL_BUSINESS_NAME=<razon-social>
PRIVACY_EMAIL=privacidad@tudominio.com
```

Genera la clave de cifrado una sola vez y consérvala en el gestor de secretos. Si se pierde, no podrán descifrarse los tokens ya guardados.

## 3. Base de datos y aplicación

Desde `web/`:

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start
```

Con Docker:

```bash
docker compose up -d --build
```

## 4. Configuración en Meta

1. Configura el callback de Embedded Signup y los dominios permitidos.
2. Usa `https://crm.tudominio.com/api/meta/webhook` como callback de webhooks.
3. Usa el mismo valor de `META_WEBHOOK_VERIFY_TOKEN` al verificarlo en Meta.
4. Suscribe la app a los campos necesarios: `messages`, `message_template_status_update`, `account_update`, `history`, `smb_app_state_sync` y `smb_message_echoes`.
5. Publica y verifica las páginas:
   - `/privacidad`
   - `/terminos`
   - `/eliminacion-datos`
6. Completa los datos reales del negocio y correo de privacidad.

## 5. Prueba de humo

- Conecta un número desde Configuración → WhatsApp.
- Envía un mensaje desde el CRM y confirma estados enviado/entregado/leído.
- Responde desde el teléfono y confirma que aparece en el CRM.
- Envía desde WhatsApp Business App y confirma el eco en el CRM.
- Comprueba que el historial sincronizado no genera respuestas automáticas.
- Crea o lista una plantilla oficial.
- Desconecta el número y confirma que deja de recibir eventos.

Consulta `META-APP-REVIEW.md` antes de enviar la app a revisión.
