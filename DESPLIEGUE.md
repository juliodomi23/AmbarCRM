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
WA_API_KEY=<secreto-para-integraciones-internas>
IP_HEADER=x-real-ip

META_APP_ID=<app-id>
META_APP_SECRET=<app-secret>
META_WEBHOOK_VERIFY_TOKEN=<secreto-aleatorio>
META_GRAPH_VERSION=v26.0
META_HUMAN_AGENT_APROBADO=false
MESSENGER_VERIFY_TOKEN=<secreto-aleatorio-largo>
META_CANALES_REVISION_ORGS=
META_MESSENGER_CONFIG_ID=
META_INSTAGRAM_CONFIG_ID=
META_TOKEN_ENCRYPTION_KEY=<32-bytes-en-base64>

NEXT_PUBLIC_META_APP_ID=<app-id>
NEXT_PUBLIC_META_CONFIG_ID=<configuration-id-de-embedded-signup>
NEXT_PUBLIC_META_GRAPH_VERSION=v26.0

LEGAL_BUSINESS_NAME=<razon-social>
PRIVACY_EMAIL=privacidad@tudominio.com
```

`IP_HEADER` es la única cabecera aceptada para límites por IP. El proxy frontal debe
sobrescribirla y eliminar cualquier valor enviado por el cliente. El compose documenta
el contrato con `x-real-ip`; la configuración del proxy administrado por EasyPanel no
forma parte de este repositorio.

Genera la clave de cifrado una sola vez y consérvala en el gestor de secretos. Si se pierde, no podrán descifrarse los tokens ya guardados.

### Correo para recuperar contraseña (opcional)

Carga estas variables en el servicio `app` de EasyPanel antes de desplegar el flujo:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | Servidor de tu proveedor SMTP |
| `SMTP_PORT` | `587` con STARTTLS o `465` con TLS directo |
| `SMTP_SECURE` | `false` para 587; `true` para 465 |
| `SMTP_USER` | Usuario del proveedor |
| `SMTP_PASSWORD` | Contraseña del proveedor (secreto, sin valor por defecto) |
| `SMTP_FROM` | Remitente autorizado, por ejemplo `AmbarCRM <no-reply@ambarrojostudios.cloud>` |
| `NEXTAUTH_URL` | URL pública HTTPS del CRM; es la base del enlace de recuperación |

Si falta algún campo SMTP o es inválido, el login oculta el enlace y los envíos se omiten
con un log sin datos personales. Aplica `prisma/sql/actualizaciones.sql` como dueño antes de
arrancar la nueva versión. El token vence en 60 minutos; solicitar otro invalida los anteriores.
Los límites de recuperación son 5 por hora por IP y por organización/correo, por proceso.

## 3. Base de datos y aplicación

BD nueva, desde `web/` (con el usuario dueño de la BD, no `crm_app`):

```bash
npm ci
npx prisma db push
psql "$DATABASE_URL_DUENO" -f prisma/sql/multi-tenant.sql   # solo PARTES B en adelante
npm run build
npm run start
```

BD existente: corre `prisma/sql/multi-tenant.sql` como dueño (ver `MULTI-TENANT.md`).
La PARTE F desactiva los canales de proveedores anteriores y deja solo `cloud_api`.

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

## 6. Respaldos

El servicio `backup` del compose genera cada 24 h un respaldo comprimido de la BD en el
volumen `backups` (`ambarcrm-AAAA-MM-DD-HHMM.sql.gz`) y borra los de más de `BACKUP_DIAS`
días (14 por defecto). En los logs del servicio verás `[backup] ok …` o `[backup] ERROR`.

Los respaldos viven en el mismo VPS: descárgalos de vez en cuando (o súbelos a un
almacenamiento externo) para no perderlos si se pierde el servidor.

Restaurar (desde la consola del servicio `backup`, con la app detenida y sobre una BD vacía;
pide ayuda antes de hacerlo en producción):

```bash
ls /backups
gunzip -c /backups/ambarcrm-AAAA-MM-DD-HHMM.sql.gz | psql -v ON_ERROR_STOP=1
```

## 7. Sembrar la demo

Carga las siete empresas de demostración (clínica, autos, inmobiliaria, retail, legal, viajes y
academia) con datos ficticios "vivos": chats con mensajes recientes y etiquetas de contacto de
colores, oportunidades en varias etapas, tareas vencidas / de hoy / próximas / sin fecha /
completadas, reseñas con distintas calificaciones y orígenes y, en retail, caja con turno abierto
y turno cerrado, pedidos en línea y cotizaciones en todos sus estados.

Requisito: la BD ya tiene `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql` aplicados.

En EasyPanel: servicio **app** → **Console** (el directorio de trabajo ya es `/app`):

```bash
for giro in clinica automotriz inmobiliaria retail legal viajes academia; do
  ALLOW_DEMO_SEED=1 node scripts/seed-demo-$giro.mjs
done
```

- Cada seed imprime `Demo <giro> lista: /login?org=<slug>`, el correo y una **contraseña
  aleatoria que solo se muestra esa vez**: cópiala al terminar. Para fijarla, pasa correo y
  contraseña: `ALLOW_DEMO_SEED=1 node scripts/seed-demo-retail.mjs retail@ejemplo.com 'Clave-Segura-1!'`.
- Empresas que crea: `demo-clinica`, `demo-auto`, `demo-inmobiliaria`, `demo-retail`,
  `demo-legal`, `demo-viajes`, `demo-academia`. Solo toca esas; no modifica otras empresas.
- Es idempotente: se puede repetir. Cada corrida vuelve a calcular las fechas respecto a "hoy"
  (mensajes recientes, tareas vencidas y de hoy), así que conviene correrlo antes de cada demo.
  Reinicia las reseñas y los turnos de caja de las empresas demo.
- Los seeds se niegan a correr con `NODE_ENV=production` y sin `ALLOW_DEMO_SEED=1`. Si la consola
  responde "bloqueados en producción", el servicio tiene `NODE_ENV=production`: es el bloqueo
  funcionando. La demo debe vivir en su propio servicio y base de datos (sin esa variable), no en la
  del cliente real.
- La demo pública sin sesión (`/demo`, enlazada desde el login) no usa estos datos: es estática.
