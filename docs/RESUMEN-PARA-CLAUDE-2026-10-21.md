# Traspaso para Claude · AmbarCRM · 21 de octubre de 2026

## Encargo

Julio pidió revisar cómo quedó la fase 2, iniciar fase 3 con máxima prioridad de facilidad de uso, crear los módulos **Marketing** y **Meta Ads**, y aclarar qué permisos adicionales necesitará la app en Meta App Review. Después pidió revisar la conexión de Instagram y Messenger. Su decisión final es explícita: **ambos deben seguir como «próximamente» en el selector de Configuración mientras tramita los permisos**. No habilitarlos para alta desde la UI hasta que Julio lo indique.

Revisa el código y la evidencia de forma independiente. Ayuda a priorizar defectos reales, especialmente aislamiento de empresas, permisos, seguridad de tokens, claridad de la interfaz y el camino de App Review. Distingue lo probado con simuladores de lo confirmado en Meta o producción. No des por aprobados permisos por encontrar scopes en el código.

## Estado del repositorio

- Workspace: `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM`.
- Rama local de trabajo: `codex/fase-3-marketing-meta-ads`, creada desde `meta-tech-provider`.
- Entrega de fase 3A: commit `c2f0b13`.
- Revisión inicial de Messenger/Instagram: commit `c6e4069`. **La habilitación de UI de ese commit se revirtió por petición posterior de Julio**; comprobar el estado actual de la rama, no asumir que ese commit sigue describiendo la interfaz.
- No hubo push, merge, despliegue, migración en producción, solicitud a App Review ni conexión a cuentas reales de Meta durante este trabajo.
- Archivos ajenos que ya estaban sin seguimiento y deben permanecer intactos: `docs/VARIABLES-CORREO-CRMLITE.md`, `docs/COMPARATIVA-CALLBELL.pdf` y los tres `docs/prompts/PROMPT-*.md` que muestre `git status`.

## Fase 2 revisada

El código actual contiene los bloques planificados: cantidades decimales; caja A1–A5; devoluciones, apartados y crédito; cotizaciones; catálogo/tienda y pedidos; precios y promociones; reportes; reseñas. [Plan y evidencia por bloque](../PLAN-MODULOS-FASE-3.md#1-revisión-de-la-fase-2). Esto **no acredita cierre operativo ni despliegue**. El viejo [plan de cierre](../PLAN-CIERRE-FASE-2.md) contiene información histórica. La regresión anterior de Belleza y Citas documenta 57 scripts y 34 checks aprobados, pero fue una ejecución previa, no la validación de fase 3.

## Fase 3A implementada: Marketing y Meta Ads internos

- Dos módulos activables por organización: `/marketing` y `/meta-ads`, con catálogo de roles, menú y permisos. Se activan desde administración de plataforma; no se activaron para clientes existentes.
- Campañas/propuestas persistidas en `campanas_marketing`, separadas por organización y tipo. SQL con RLS, permisos explícitos y revocación de `DELETE`/`TRUNCATE` para el rol de aplicación.
- Alta, edición, búsqueda/filtros, paginación, envío a revisión, aprobación **interna por administrador**, reapertura y archivo. Validaciones del servidor y control de versión para evitar pisar una edición concurrente.
- UI con captura guiada de tres pasos, estados vacíos, mensajes de error y límites claros. En Meta Ads se puede guardar un borrador con presupuesto cero, pero no enviarlo a revisión hasta corregirlo. Se comprobó a 390 × 844 sin desborde horizontal.
- Rutas API `/api/marketing/campanas` y `/api/meta-ads/campanas`; el matcher del proxy se corrigió para proteger `/api/meta-ads`.
- **No hay OAuth de Ads, cuentas publicitarias conectadas, métricas sincronizadas, publicación, gasto ni leads importados.** Una aprobación en CRM no significa aprobación o publicación en Meta.

Código principal: `web/src/lib/marketing.ts`, `web/src/lib/marketing-db.ts`, `web/src/components/marketing/`, `web/src/app/api/{marketing,meta-ads}/`, `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`, `web/src/lib/modulos-catalogo.ts` y `web/src/proxy.ts`. [Plan completo de las entregas 3A–3D](../PLAN-MODULOS-FASE-3.md).

## Validación realizada para 3A

[Registro detallado y capturas](pruebas-marketing-2026-10-21/README.md): PostgreSQL 16 desechable, datos sintéticos, app local y red externa bloqueada. SQL de actualización aplicado tres veces y de nuevo para verificar la revocación; prueba de aislamiento sobre 86 tablas. Pasaron Prisma validate, TypeScript, lint, checks específicos, build de Next.js con fuentes simuladas y prueba HTTP con NextAuth real para ambas rutas. El control de concurrencia mostró 2 escrituras aceptadas sin protección frente a 1 aceptada y 1 conflicto con versión. Se recorrió la UI en escritorio y móvil.

La batería general quedó en **37 de 38 checks**. `check-recuperar-password.ts` exige otra base desechable exclusiva (`:55461/crm_recuperar`) y no se ejecutó en esta sesión; no se observó un fallo funcional de ese módulo. El build con fuentes simuladas no equivale a descargar fuentes en despliegue. La base desechable y el servidor local ya se detuvieron/eliminaron.

## Permisos y App Review

- Para el trabajo interno actual de Marketing/Meta Ads **no hacen falta nuevos permisos**.
- Para consultar campañas/resultados publicitarios de cuentas de clientes: evaluar `ads_read` con el nivel de acceso necesario. Para crear/modificar/pausar anuncios: `ads_management`. Para respuestas de formularios: `leads_retrieval` y dependencias vigentes del flujo concreto. No agregar todos los scopes preventivamente.
- El panel de la app no se consultó: estado de permisos aprobados, Advanced Access, verificación empresarial y configuración exacta siguen sin confirmar. Una aprobación de WhatsApp/Messenger no acredita Ads.
- [Análisis de Ads](META-ADS-APP-REVIEW.md) y [fuente oficial accesible de Marketing API](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi). Las páginas de `developers.facebook.com` consultadas devolvieron 429/acceso no disponible; no se usaron para certificar requisitos.

## Messenger e Instagram

- El selector de **Configuración → Canales debe mostrar Messenger e Instagram deshabilitados como «próximamente»** hasta la decisión de Julio tras tramitar permisos. El backend ya contiene rutas y servicios; las tarjetas de canales existentes permanecen visibles. La revisión está en [revisión de conexiones](revision-conexiones-instagram-messenger-2026-10-21.md).
- Messenger: Facebook Login pide `pages_show_list,pages_messaging,pages_manage_metadata`; permite elegir página y también configuración manual. Intento ligado a empresa, usuario y sesión, con vencimiento de 10 minutos; tokens cifrados y webhooks firmados. Existe [paquete de App Review](META-APP-REVIEW-MESSENGER.md), pero no se confirmó acceso real. La capacidad `HUMAN_AGENT` es una comprobación/aprobación distinta.
- Instagram: solo configuración manual de cuenta profesional vinculada a página, con token de página, App ID y App Secret. Webhook/envío probados con Graph simulado. La [colección oficial de conversaciones de Meta](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) enumera para ese flujo `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, acceso de página y requisitos de negocio. No confundirlo con los scopes `instagram_business_*` de Instagram Login, flujo que este código no implementa.
- Pendiente probar una página/cuenta de prueba real, recepción, respuesta, adjuntos, permisos efectivos, `HUMAN_AGENT` y el efecto de suscribir/desuscribir Instagram y Messenger si comparten página/app. La desconexión usa `DELETE /{pageId}/subscribed_apps`; verificar que no retire la suscripción del otro canal. No usar una página de cliente para esta prueba.
- La prueba nueva de UI intentada durante la revisión no se ejecutó: `tsx` no está instalado en esta sesión y `npx` no pudo descargarlo por falta de red. TypeScript y ESLint de los cambios transitorios pasaron; el selector y la prueba se restauraron al comportamiento «próximamente».

## Qué conviene revisar ahora

1. Confirmar con `git diff` y la UI que Messenger/Instagram siguen deshabilitados en el selector y que los módulos Marketing/Meta Ads no anuncian publicación real.
2. Revisar la migración SQL y la seguridad de `marketing-db.ts`: tenant, RLS, aprobación admin, estados y carrera de versión. Contrastar con la evidencia, no solo con los tests.
3. Hacer una pasada de UX de Marketing/Meta Ads en tareas completas, sobre todo nombres, ayuda al usuario, errores, teclado, lector de pantalla y móvil. Separar mejoras necesarias de extras.
4. Revisar el recorrido de Meta con el panel real cuando Julio lo tenga listo: permisos/niveles de acceso, requisitos de App Review, video y cuenta de prueba. No pedir ni enviar permisos basados solo en suposiciones.
5. Para Instagram/Messenger, auditar el caso de página/app compartida y un plan seguro de humo real. Mantener el estado «próximamente» hasta decisión explícita de Julio.
