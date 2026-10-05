# AmbarCRM

CRM multiempresa para atender conversaciones de WhatsApp, administrar contactos, oportunidades, agentes y automatizaciones de n8n.

## Arquitectura activa

- **Canal único:** WhatsApp Business Platform, Meta Cloud API.
- **Onboarding:** Embedded Signup v4 con Coexistence para conservar el uso de WhatsApp Business App.
- **Frontend y API:** Next.js 16.
- **Datos:** PostgreSQL + Prisma, con aislamiento por organización.
- **Tiempo real:** SSE respaldado por PostgreSQL LISTEN/NOTIFY.
- **Automatización:** bots propios conectados a n8n mediante webhooks y tokens por bot.

Los tokens de Meta se intercambian y almacenan únicamente en el servidor, cifrados con AES-256-GCM. El navegador solo recibe un resumen sanitizado del canal.

## Capacidades de WhatsApp

- Conectar uno o más números mediante Embedded Signup.
- Enviar y recibir texto, imágenes, video, audio y documentos.
- Recibir estados de entrega y lectura.
- Sincronizar mensajes enviados desde WhatsApp Business App mediante Coexistence.
- Importar el historial inicial sin disparar bots, respuestas automáticas ni nuevos leads.
- Listar y crear plantillas oficiales desde el CRM.
- Desconectar un número y cancelar la suscripción de la aplicación.

## Documentación

| Archivo | Propósito |
|---|---|
| `DESPLIEGUE.md` | Variables y pasos de instalación |
| `META-APP-REVIEW.md` | Checklist para revisión de Meta |
| `INTEGRACION-N8N.md` | Automatizaciones con n8n |
| `INTEGRACION-BOTS.md` | Contrato de bots propios |
| `MULTI-TENANT.md` | Aislamiento entre organizaciones |
| `modelo-datos.md` | Resumen del modelo relacional |

## Validación local

Desde `web/`:

```bash
npm run lint
npx prisma validate
npm run build
```

Antes de producción también debe probarse el flujo completo con una app real de Meta, un número de prueba y un dominio HTTPS público.
