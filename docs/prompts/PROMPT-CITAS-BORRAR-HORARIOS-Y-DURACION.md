# Prompt para Codex — Citas: borrar canceladas, solo horarios definidos y fin automático

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.
> Requisito: `revision-citas` ya fusionada en `modulos-fase-2` (SHA `89b55b7` o posterior) y árbol limpio.
> Cambia una decisión de la revisión anterior: la agenda interna **ya no solo avisa** fuera de horario; ahora **bloquea**.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Verifica que `modulos-fase-2`
contiene `89b55b7` y que el árbol está limpio (el archivo sin seguimiento de prompts es normal); si no,
**detente y repórtalo**. Crea la rama `citas-borrar-horarios-duracion` desde `modulos-fase-2`.
**No hagas push ni deploy, no toques producción, `meta-tech-provider`, `main` ni `ambarcrm-db`, y no llames a
ninguna red real.** Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` +
`multi-tenant.sql` + `actualizaciones.sql` (no `prisma db push`), commit por paso, en español, sin comentarios
obvios ni librerías nuevas.

Lee primero: `docs/revision-citas-2026-10-17.md` (criterios conservadores y decisiones), `lib/citas-servidor.ts`,
`lib/citas-reglas.ts`, `lib/citas-avisos.ts`, `lib/reservas/servidor.ts` y `lib/reservas/horarios.ts`,
`app/api/citas/route.ts` y `[id]/route.ts`, `components/citas/*` (sobre todo `FormularioCitaModal.tsx`,
`DetalleCitaModal.tsx`, `CalendarioSemanal.tsx`, `CitasContacto.tsx`), `app/api/v1/.../appointments/**`, los
modelos `Cita`, `ServicioReserva`, `HorarioDoctor`, `ExcepcionHorario`, y las relaciones de `Cita` con
`EvolucionClinica`, `SolicitudResena` y cobros (`onDelete`).

### Qué hacer (un commit por tarea)

1. **Borrar citas canceladas.**
   - Nueva ruta `DELETE /api/citas/[id]` (mismo `conModulo("citas")`): **solo** citas en estado `cancelada`
     (otros estados → 409 con mensaje claro: "Cancela la cita antes de eliminarla"). Respeta aislamiento por
     empresa (id ajeno → 404).
   - Antes de borrar, revisa qué cuelga de la cita (evoluciones clínicas, solicitudes de reseña, cobros,
     bitácora): **nunca borres historial clínico ni dinero**. Si la cita tiene evolución clínica o cobro
     ligado, responde 409 y explica el motivo; si solo tiene solicitud de reseña pendiente, desvincúlala o
     elimínala según el `onDelete` actual, sin dejar huérfanos. Documenta la regla.
   - Registra el borrado en la bitácora si el repo ya tiene una para acciones de personal.
   - UI: botón "Eliminar" visible solo en citas canceladas (detalle y lista), con el `Confirmador` del repo,
     toast de éxito/error y refresco de la agenda. Opcional y solo si es trivial: "Eliminar canceladas" en
     lote para el rango visible; si no es trivial, repórtalo.
   - Actualiza el número fijo de rutas en `check-arquitectura-modulos.ts`.
   - El bot (`appointments`) **no** borra citas; no añadas esa capacidad.

2. **Solo horarios definidos (de aviso a bloqueo).**
   - En la agenda interna (`POST` y `PATCH /api/citas`), una cita con especialista debe caer dentro de la
     jornada del especialista (`HorarioDoctor`) y fuera de sus excepciones de cierre (`ExcepcionHorario`),
     usando `lib/reservas/horarios.ts` y la zona del negocio. Fuera de horario → 409 con mensaje claro
     ("Ese especialista no atiende a esa hora. Horario: …").
   - Regla para no romper negocios sin horarios cargados: si el especialista **no tiene ningún horario
     definido**, no se bloquea (se mantiene el aviso de la revisión anterior) y la pantalla invita a definir
     su horario. Con al menos un horario definido, se bloquea.
   - La cita debe caber completa: inicio y fin dentro de una misma ventana de trabajo (no cruzar el
     descanso entre dos ventanas del mismo día). Citas sin especialista siguen sin validarse contra horarios.
   - Decisión conservadora sobre el pasado: no se bloquea editar estado/notas de citas pasadas ni cambiar su
     estado; solo se valida horario cuando cambian `inicio`, `fin` o `doctorId`. Agendar en el pasado: permitido
     solo si es el mismo día local (para registrar una cita que acaba de pasar); fechas anteriores → 400.
   - El calendario debe **mostrar** lo que se puede agendar: sombrea o atenúa las horas fuera de jornada del
     especialista seleccionado (y excepciones), y al tocar un hueco no permitido avisa en vez de abrir el
     formulario. Con "todos los especialistas" no se atenúa nada.
   - Reservas en línea y bot no cambian (ya exigen disponibilidad real); sus pruebas siguen verdes sin tocarse.
   - `lib/citas-avisos.ts`: conserva el aviso solo para el caso sin horarios definidos.

3. **Fin automático y duración.**
   - En `FormularioCitaModal`, al elegir la hora de inicio se calcula el fin automáticamente y se muestra
     editable. Prioridad de duración: (a) servicio elegido (`duracionMin`, y si se agenda para el cliente
     también el `bufferMin` solo en el bloqueo interno, no en la hora de fin visible); (b) duración por defecto
     de la empresa; (c) 30 minutos. Si el usuario edita el fin a mano, deja de autocompletarse hasta que
     cambie el servicio o el inicio de nuevo (sin pisar su edición por sorpresa).
   - Agrega un selector opcional de **servicio** (usa `ServicioReserva` activos; al elegir uno rellena título,
     duración y filtra los especialistas que lo hacen). Guarda `servicioId` en la cita. Sin servicio sigue
     funcionando con título libre. No inventes un catálogo nuevo.
   - Duración por defecto de la empresa: si hace falta guardarla, usa la configuración existente del módulo
     (`ModuloOrg.config` de `citas`) sin cambios de esquema; añade el campo en `CitasConfig.tsx` con rango
     validado (5 a 480 min).
   - Al mover una cita (arrastrar no existe; usa Editar), cambiar el inicio conserva la duración y recalcula
     el fin. Al elegir hueco del calendario se rellena inicio y fin según la duración por defecto/servicio.
   - Los `datetime-local` pasan a ser fecha + hora separadas (mejor en celular) o, si ya funcionan bien en
     móvil, se dejan; decide con evidencia en la app compilada a 390 px. Paso de 5 minutos (o la granularidad
     configurada), sin segundos.
   - Mismo cálculo de fin en el servidor: si el cliente manda `servicioId` sin `fin`, el servidor lo calcula;
     el servidor es la autoridad y rechaza fin inconsistente.

4. **Pulido relacionado (solo lo que sea defecto, sin rediseñar):** mensajes de error claros en español para
   cada 409/400 nuevo; el botón de guardar muestra el motivo si el horario no es válido; la lista de
   especialistas del formulario solo ofrece activos; accesibilidad básica (foco, etiquetas) en los campos
   nuevos; nada de textos "doctor" nuevos: reutiliza el vocabulario actual de la pantalla.

5. **Pruebas** (amplía `prisma/scripts/test-citas.ts` o crea `test-citas-horarios.ts`; añade a la regresión):
   borrar cancelada OK; borrar no cancelada → 409; borrar con evolución/cobro → 409; id ajeno → 404;
   aislamiento entre empresas; dentro de horario OK; fuera de horario → 409; cita que cruza el descanso →
   409; excepción de cierre → 409; especialista sin horarios definidos → permitido con aviso; edición de
   estado de cita pasada permitida; mover a fecha pasada anterior al día → 400; cálculo de fin por servicio,
   por defecto de empresa y por 30 min; servidor calcula `fin` si falta; servicio inactivo/ajeno → 400;
   reservas públicas y bot siguen intactos (sus pruebas existentes verdes). Verificación en la app compilada
   con capturas (móvil y escritorio) del formulario con fin automático, del calendario con horas atenuadas, del
   bloqueo fuera de horario y del borrado con confirmación; guárdalas en
   `docs/capturas/citas-horarios-2026-10-18/`.

6. **Docs:** actualiza `docs/revision-citas-2026-10-17.md` (o una sección nueva con fecha) con las reglas nuevas
   (borrado, bloqueo por horario y su excepción sin horarios, cálculo de duración), `MODULOS.md` y, solo si
   algo cambia para el bot, `docs/api-bot.md`.

7. **Regresión completa** en la BD desechable (tsc, lint, `prisma validate`, build, `actualizaciones.sql` ×3,
   `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`, todos los `check-*.ts`).
   Agrega los resultados reales (incluidos fallos) a `docs/regresion-pre-merge-2026-10-17.md` en sección nueva
   con fecha. Retira el contenedor y detén la app. Si algo falla, corrígelo y repite.

8. **Merge local solo si todo pasó:** árbol limpio, `git switch modulos-fase-2`,
   `git merge --ff-only citas-borrar-horarios-duracion`. Si no es fast-forward, detente y repórtalo; sin reset,
   rebase ni merge con commit. **No fusiones en `meta-tech-provider` y no hagas push.**

### Fuera de alcance

Recursos (sillas/cabinas), varios servicios por visita, depósitos, lista de espera, citas recurrentes, arrastrar
y soltar, vínculo usuario↔doctor, etiquetas por giro, confirmar/reprogramar por token público, cambios a
plantillas de Meta, WhatsApp/Messenger/Instagram, flujos que revisa Meta, otros módulos y correr nada contra
producción. Si algo de esto es necesario para cumplir un paso, no lo implementes: repórtalo.

### Entrega (una sola parada)

Commits nuevos, qué quedó implementado y qué se recortó (con motivo), la regla exacta de borrado (qué lo
impide), cómo se comporta el bloqueo con y sin horarios definidos, resultado de la regresión por prueba,
capturas, SHA final de `modulos-fase-2` si el merge se hizo y lo pendiente de Julio con 🛑 (probar en la demo con
horarios reales de una clínica y de un salón, confirmar la duración por defecto que quiere cada giro, ensayo con
respaldo real y Aurum de pruebas).
