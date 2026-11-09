# Contenido y copys

## Activación y alcance

El módulo usa la clave `contenido`, aparece en `/contenido` y se activa por
organización en **Configuración → Clientes Ámbar CRM**. No está restringido a un
`orgId` y permanece apagado mientras la plataforma no lo active. Los puestos
sugeridos son Administrador, Mercadotecnia y Dirección comercial.

Contenido no publica en redes sociales ni envía mensajes. Prepara piezas, ordena
la revisión y muestra el calendario semanal. Se puede relacionar una pieza con un
contacto existente y con una campaña de Marketing mediante `campana_id`, sin
modificar el comportamiento del módulo Marketing.

## Flujo editorial

| Estado | Uso |
| --- | --- |
| `idea` | Pieza propuesta, sin copy definitivo. |
| `redaccion` | El redactor trabaja el copy. |
| `revision` | Lista para revisión. |
| `cambios` | El revisor pidió ajustes. |
| `aprobado` | Aprobada para publicarse. |
| `programado` | Tiene fecha de publicación. |
| `publicado` | Ya se publicó; es el estado final. |

Transiciones permitidas:

- `idea → redaccion`
- `redaccion → revision`
- `revision → cambios | aprobado`
- `cambios → revision`
- `aprobado → programado | revision`
- `programado → publicado | aprobado`
- `publicado` no cambia.

Editar el copy de una pieza `aprobado` o `programado` la regresa a `revision`.
Un comentario de tipo `cambio_solicitado` deja la pieza en `cambios`; los
comentarios y cambios de estado quedan en la bitácora de la pieza.

## Permisos

- Administrador y Dirección comercial pueden aprobar cualquier pieza.
- El revisor asignado puede aprobar si no es el redactor de la misma pieza.
- El redactor y el revisor pueden editar la pieza; otros usuarios de
  Mercadotecnia no.
- El servidor valida la aprobación y la edición; la interfaz solo refleja el
  resultado.

## Calendario y canales

La vista principal muestra la semana de lunes a domingo en
`America/Mexico_City`. Los canales disponibles son Instagram, Facebook, LinkedIn,
TikTok, WhatsApp, Blog, Correo y Otro; los formatos son imagen, video, carrusel,
texto, reel, historia, artículo y otro. El enlace de material solo acepta
`https://`.

## Rutas

| Ruta | Uso |
| --- | --- |
| `/contenido` | Calendario de la semana actual. |
| `/contenido/tablero` | Piezas por estado y filtros. |
| `/contenido/revision` | Bandeja de revisión y cambios solicitados. |
| `/contenido/piezas` | Listado completo de piezas. |

Las APIs viven en `/api/contenido/piezas*` y están protegidas con
`conModulo("contenido", …)`. Cada edición envía `version`; una versión anterior
se rechaza con 409.

## Pruebas y demo

- `npx tsx scripts/check-contenido.ts` valida reglas puras; con `CHECK_DB=1`
  agrega RLS, activación del módulo, comentarios y control de versión.
- `ALLOW_DEMO_SEED=1 ORG_SLUG=refmex node scripts/seed-demo-contenido.mjs correo contraseña`
  usa la misma organización `refmex` y agrega campañas, piezas de la semana,
  comentarios y cambios de estado ficticios.
- `prisma/scripts/test-aislamiento.ts` incluye los CHECK nuevos de canal,
  formato, estado y tipo de comentario.
