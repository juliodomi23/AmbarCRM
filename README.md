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
| [PLAN-MODULOS-FASE-3.md](PLAN-MODULOS-FASE-3.md) | Revisión de fase 2, prioridades de UX y entregas de Marketing y Meta Ads |
| [MODULOS.md](MODULOS.md) | Capacidades y activación de los módulos por organización |
| [docs/META-ADS-APP-REVIEW.md](docs/META-ADS-APP-REVIEW.md) | Permisos y revisión para las futuras integraciones de Meta Ads |
| `DESPLIEGUE.md` | Variables y pasos de instalación |
| `META-APP-REVIEW.md` | Checklist para revisión de Meta |
| `INTEGRACION-N8N.md` | Automatizaciones con n8n |
| `INTEGRACION-BOTS.md` | Contrato de bots propios |
| `MULTI-TENANT.md` | Aislamiento entre organizaciones |
| `modelo-datos.md` | Resumen del modelo relacional |

## Marketing y Meta Ads

La fase 3 incorpora **Marketing** para organizar campañas y **Meta Ads** para preparar
propuestas de anuncios. La primera entrega guarda borradores, revisión, aprobación
interna por administrador y archivo, con aislamiento por organización y control de
versiones. La plataforma activa cada módulo desde Configuración → Clientes Ámbar CRM.

Esta entrega es interna: aprobar no publica anuncios ni genera gasto. Conectar Meta,
consultar resultados, publicar e incorporar leads son etapas posteriores descritas en
el [plan de fase 3](PLAN-MODULOS-FASE-3.md). El plan también distingue la evidencia de
pruebas existente de las verificaciones pendientes; no confirma producción ni App Review.

## Validación local

Desde `web/`:

```bash
npm run lint
npx tsc --noEmit
npx prisma validate
npm run build
```

Antes de producción también debe probarse el flujo completo con una app real de Meta, un número de prueba y un dominio HTTPS público.
