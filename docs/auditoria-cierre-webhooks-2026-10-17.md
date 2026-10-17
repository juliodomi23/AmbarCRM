# Auditoría de cierre de webhooks y automatizaciones · 17-oct-2026

Estado inicial comprobado en `webhooks-y-automatizaciones`, HEAD `7269857`.
`git log modulos-fase-2..HEAD` contiene los 14 commits indicados abajo;
`modulos-fase-2` parte de `cc649ea` y es ancestro de HEAD. No había cambios
en archivos seguidos. Solo estaban sin seguimiento los dos prompts y la carpeta
de evidencia expresamente autorizados; se incorporaron sin editar en `4fb1dfa`.
No se encontraron otros archivos sueltos.

| Paso | Estado real al iniciar | Evidencia contrastada |
|---|---|---|
| 1 | Completo | `748af3c`: SQL idempotente y modelo `WebhookSaliente`, org por defecto, RLS, GRANT, secreto cifrado; cupo serializado en servicio. |
| 2 | Completo | `e50c40f`: `webhooks-salientes.ts` reutiliza `entregarWebhookApi`, publica sin esperar y actualiza contador atómicamente; desactiva al fallo 20. |
| 3 | Completo con recorte permitido | `1702eb3`: ingesta publica contacto/conversación nuevos, mensaje entrante y reapertura; `conversacion-estado.ts` publica edición de estado tras commit. `mensaje.enviado` reservado pero sin punto común limpio: conectar todos los envíos exigiría tocar rutas excluidas. UI lo oculta y docs lo explican. |
| 4 | Completo | `7a2e3c2`: GET/POST, PATCH/DELETE y probar bajo `conAdminIntegracion`; secreto solo al crear. Check distingue 96 rutas de módulo y 7 administrativas (103). |
| 5 | Completo | `e41e98e`: `WebhooksSalientes` dentro de `TabAutomatizaciones`: alta, suscripciones, activar, probar, estado, eliminar con confirmación y secreto de una sola lectura. |
| 6 | Completo, pendiente repetir | `0ec3927`: `test-webhooks-salientes.ts` usa receptor HTTPS simulado, comprueba firma, suscripción, RLS, reintentos, SSRF, fallos, permisos, privacidad y cupo concurrente sin/con bloqueo. |
| 7 | Completo | `681eaa7`: `webhooks-salientes.md` describe puntos, recorte, firma n8n, límites y reintentos; decisión en `canales-decisiones.md`. |
| 8 | Completo | `bb96dfc`: modelos y SQL de regla/ejecución con JSONB, org por defecto, RLS, GRANT y esquema estricto en servidor. |
| 9 | Completo con recorte documentado | `f93134e`: motor, AND, cinco acciones, límite 20/h serializado, errores fijos y aislamiento de acciones. Reutiliza servicios de conversación, etiquetas y proveedores. No existe entidad equipo: asigna solo agente. `PlantillaMensaje` es respuesta rápida, fuera de 24 h omite el envío; no presupone aprobación Meta. |
| 10 | Completo | `7efb334`: `dispararEvento` comparte los enganches de webhooks; solo ejecuta reglas para contacto/agente y tres disparadores. |
| 11 | Completo | `75da9c2`: CRUD admin, simulación fija sin efectos y últimas 50 ejecuciones; validación de referencias bajo RLS y cupo de 25 serializado. |
| 12 | Completo | `1679714`: constructor `EditorRegla`, lista/edición, activar, simular y bitácora en `TabAutomatizaciones`, conservando sus ajustes. |
| 13 | Completo, pendiente repetir | `436237b`: `test-automatizaciones.ts` verifica siete tipos de condición sí/no, cinco acciones, permisos, RLS, anti-bucles, 24 h, errores, simulación y carreras sin/con bloqueo. |
| 14 | Completo | `7269857`: `automatizaciones.md` cubre condiciones, acciones, límites, recortes y ejemplos de clínica/tienda; decisión en `canales-decisiones.md`. |
| 15 | Incompleto | Había evidencia de ejecuciones anteriores, pero faltaba la regresión de cierre con informe nuevo y retiro comprobado del entorno. Se ejecuta de nuevo y se registra por prueba en `regresion-pre-merge-2026-10-17.md`. |
| 16 | Pendiente | `modulos-fase-2` aún en `cc649ea`. Solo se permite fast-forward local después de la regresión completa sin fallos, retiro del contenedor y árbol limpio. |

No se añaden eventos fuera del alcance ni se amplían los puntos a importaciones,
altas manuales, bots o crons. Los dos recortes anteriores ya estaban documentados
y son compatibles con las excepciones del prompt. No faltaba completar ningún
paso 1–14 antes de repetir la regresión.
