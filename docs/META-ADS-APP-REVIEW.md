# Marketing y Meta Ads: alcance y App Review

Fecha de revisión: **20 de octubre de 2026**.

**Sí harán falta permisos adicionales para conectar cuentas publicitarias de clientes.** La entrega inicial de fase 3 guarda la planificación y los borradores dentro de AmbarCRM; esas operaciones internas no necesitan permisos nuevos de Meta.

Este documento prepara el siguiente alcance de integración. No acredita permisos aprobados, no es una solicitud enviada a Meta y no sustituye la comprobación del panel de la app.

## 1. Qué hace esta entrega

- **Marketing:** organizar campañas, objetivos, públicos, contenido y fechas dentro del CRM.
- **Meta Ads:** preparar propuestas publicitarias y presupuestos previstos, guardar borradores y registrar una revisión interna.
- La información se conserva en AmbarCRM. Guardar o aprobar una propuesta no crea anuncios, no programa publicaciones en Meta y no activa gasto publicitario.
- La fase 3 no amplía el OAuth ni cambia la conexión existente de WhatsApp o Messenger.

La interfaz debe describir estas acciones como planificación o aprobación interna. No debe mostrar una cuenta publicitaria como conectada, resultados como sincronizados o un anuncio como publicado sin confirmación de la integración real.

## 2. Permisos según la funcionalidad

La colección oficial de Meta confirma la distinción de acceso: para cuentas propias puede bastar Standard Access; para gestionar cuentas publicitarias de terceros se necesita Advanced Access de `ads_read` y/o `ads_management`, según el uso. Tener acceso a los activos del cliente no demuestra por sí solo que la app tenga ese nivel. Fuente consultada: [Marketing API de Meta en Postman](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi).

| Funcionalidad | Permiso que se debe evaluar | Situación de fase 3 |
|---|---|---|
| Planificación de Marketing y borradores de Meta Ads guardados en AmbarCRM | Ninguno adicional de Meta | Alcance disponible; no hay llamada publicitaria a Meta. |
| Consultar campañas, inversión y métricas publicitarias | `ads_read` | Integración pendiente. Es el primer alcance recomendado si solo se mostrarán resultados. |
| Crear, modificar o pausar campañas/anuncios y cambiar presupuestos en Meta | `ads_management` | Integración pendiente. Incluye lectura; no añadir ambos permisos automáticamente sin revisar el alcance. |
| Incorporar respuestas de formularios Lead Ads como contactos del CRM | `leads_retrieval` y sus dependencias vigentes | Integración pendiente. Leer métricas no equivale a recuperar nombre, teléfono u otras respuestas de una persona. |
| Permitir que el administrador elija una página de Facebook | `pages_show_list` | Ya solicitado en el flujo de Messenger; aprobación y acceso real por confirmar. |
| Leer datos de páginas o trabajar con formularios/anuncios asociados a ellas | `pages_read_engagement` y/o `pages_manage_ads`, según el endpoint | Condicional; verificar la referencia de cada operación antes de ampliar el scope. |
| Suscribir una página al webhook `leadgen` | `pages_manage_metadata`, junto con el acceso necesario para recuperar leads | Pendiente. La suscripción actual de Messenger no habilita automáticamente eventos de Lead Ads. |
| Descubrir o administrar activos de Business Portfolio | `business_management` | Incluir solo cuando el endpoint, el flujo o una dependencia vigente lo requieran. |

Los nombres de permisos de esta matriz sirven para delimitar la futura integración. **La combinación final de dependencias de Lead Ads no quedó verificada en esta consulta**: las páginas oficiales de referencia devolvieron errores de acceso. No copiar toda la matriz al scope de inicio de sesión. Confirmar las dependencias en el panel y la documentación de la versión Graph utilizada antes de implementar o enviar ese alcance.

`read_insights` no debe añadirse por interpretar que cualquier resultado publicitario lo necesita: primero comprobar si se consultarán métricas de anuncios o estadísticas de una página y qué exige el endpoint concreto.

## 3. Lo comprobable en el repositorio

- `web/src/lib/meta/messenger-facebook.ts` solicita `pages_show_list,pages_messaging,pages_manage_metadata`.
- El checklist principal contempla `whatsapp_business_management`, `whatsapp_business_messaging` y `business_management` condicional.
- WhatsApp Embedded Signup utiliza una configuración externa mediante `config_id`; el código por sí solo no permite comprobar todos los permisos habilitados allí.
- La conexión de Ads, sus tokens y sus llamadas a Marketing API no forman parte de esta entrega interna.

Un scope escrito en código, una casilla en este documento o una conexión válida de WhatsApp no acreditan aprobación de Ads. Messenger tiene su propio [paquete de revisión](META-APP-REVIEW-MESSENGER.md), incluida la capacidad Human Agent cuando corresponda.

## 4. Qué falta comprobar en el panel de Meta

- [ ] App ID y app existente que se utilizará para Marketing API.
- [ ] Permisos concedidos y nivel de acceso de cada uno; distinguir Standard de Advanced.
- [ ] Estado de la verificación empresarial y requisitos que Meta muestre para el caso de uso elegido.
- [ ] Configuración de Facebook Login for Business, activos seleccionables y consentimiento efectivo del cliente.
- [ ] Acceso del usuario o sistema a las cuentas publicitarias, páginas y leads necesarios.
- [ ] Para Lead Ads: dependencias actuales, acceso del CRM a leads y suscripción `leadgen`.
- [ ] Capacidades adicionales de acceso a anuncios que solicite el panel, separadas de los scopes OAuth.
- [ ] Estado de cualquier revisión pendiente y forma de añadir el nuevo alcance en la misma app.

No se accedió al dashboard en esta revisión. El estado de verificación, las aprobaciones, la elegibilidad y las dependencias específicas de esta app permanecen **por confirmar**. Una prueba con el administrador de la app tampoco acredita acceso de clientes externos.

## 5. Preparar la revisión cuando exista la integración

1. Implementar primero la función concreta que se va a solicitar. Para un panel de resultados, empezar por lectura; añadir gestión y leads cuando exista un flujo demostrable.
2. Probar con activos autorizados de prueba y verificar que cada organización accede solo a sus propios datos. Las operaciones que crean anuncios deben dejar clara su publicación y su posible gasto antes de ejecutarse.
3. Preparar una cuenta de revisor del CRM, una organización aislada, URL pública estable e instrucciones breves para llegar al módulo.
4. Grabar el recorrido real: iniciar sesión, autorizar permisos, seleccionar el activo y ejecutar la acción justificada. Para lectura, mostrar resultados reales; para gestión, mostrar la operación en Meta; para leads, demostrar que una respuesta de prueba llega al contacto correcto del CRM.
5. Documentar por permiso qué acción lo usa y en qué minuto aparece. Mostrar también la desconexión y el tratamiento de datos. No presentar una maqueta o una aprobación interna como una llamada real a Meta.
6. Revisar en el panel los requisitos finales de la solicitud y completar solo el alcance implementado. Una aprobación previa de WhatsApp/Messenger no reemplaza la revisión de los nuevos permisos de Ads.

No es necesario crear otra app solo por añadir los módulos. La decisión depende de la configuración y los casos de uso disponibles de la app actual, que todavía no se verificaron.

## 6. Fuentes y límites de la consulta

**Fuente oficial accesible el 20 de octubre de 2026:**

- [Colección de Marketing API publicada por Meta en Postman](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi): confirma los permisos publicitarios y la distinción entre cuentas propias y cuentas de terceros.

**Referencias oficiales consultadas que devolvieron 429 o acceso no disponible:**

- [Autorización de Marketing API](https://developers.facebook.com/docs/marketing-api/get-started/authorization/).
- [Referencia de permisos](https://developers.facebook.com/docs/permissions/).
- [Recuperación de leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/).
- [Niveles de acceso de Graph API](https://developers.facebook.com/docs/graph-api/overview/access-levels/).

Se conservan como enlaces para completar la comprobación, no como evidencia de que se haya leído su contenido vigente o de que AmbarCRM ya tenga acceso. No se utilizaron copias de terceros para certificar requisitos. No se enviaron solicitudes de App Review ni se modificó la configuración de Meta.
