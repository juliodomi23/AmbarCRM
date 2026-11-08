# Prompt para Codex — Revisión a fondo de Citas (y Reservas en línea)

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.
> Rama aparte: `revision-citas`. Se fusiona en `modulos-fase-2` solo si todo pasa.
> Conviene correrla **después** de que cualquier otra corrida de Codex haya terminado (misma carpeta).

## Hallazgos previos (verificados leyendo el código; confírmalos tú, no los asumas)

1. `POST /api/citas` y `PATCH /api/citas/[id]` (agenda interna del personal) **no revisan empalmes** del
   especialista ni bloquean la fila del doctor. Reservas en línea y bot sí (`reservarCita` /
   `reprogramarCita` en `lib/reservas/servidor.ts`, con `FOR UPDATE`). Dos recepcionistas pueden agendar al
   mismo doctor a la misma hora.
2. `PATCH /api/citas/[id]` al cambiar `inicio`/`fin` **no limpia `recordatorioEnviadoAt`**; el bot sí. Una cita
   reprogramada desde la agenda nunca recibe recordatorio de la hora nueva.
3. `PATCH` valida pero no recorta `titulo` vacío (`"titulo" in b` acepta cadena vacía), no valida longitudes
   y puede cambiar `doctorId` sin revisar empalme en la nueva agenda.
4. `GET /api/citas` acepta cualquier rango (`desde`/`hasta`) sin tope: una consulta de años devuelve todo.
5. El cron `recordatorios-citas` envía solo a `programada`/`confirmada` y reclama antes de enviar (bien), pero
   si el envío falla la cita queda marcada como recordada y **no se reintenta**; además `findMany take: 100`
   sin continuar. Revisa si es decisión o defecto y documenta/corrige.
6. No existe `prisma/scripts/test-citas*.ts`; solo hay `test-reservas-concurrentes.ts`. La agenda interna, el
   cron, los estados y el límite por teléfono de reservas públicas no tienen pruebas dedicadas.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte de `modulos-fase-2`
(árbol limpio) y crea la rama `revision-citas`. **No hagas push ni deploy, no toques producción,
`meta-tech-provider`, `main` ni `ambarcrm-db`, y no llames a ninguna red real** (WhatsApp/Graph simulados).
Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` +
`multi-tenant.sql` + `actualizaciones.sql` (no `prisma db push`), commit por paso, en español, sin comentarios
obvios ni librerías nuevas. Dinero y concurrencia con `transaccionTenant()` + `SELECT … FOR UPDATE`.

**Objetivo: que Citas y Reservas en línea queden perfectos y a prueba de errores**, sin cambiar lo que ya
funciona ni abrir funciones nuevas. Si algo es una decisión de producto dudosa, no la cambies: repórtala.

Lee primero: `modulos-catalogo.ts` (claves `citas`, `reservas_en_linea`), `src/app/api/citas/**`,
`src/app/api/reservas/**`, `src/app/api/public/reservas/**`, `src/app/reservar/**`,
`src/app/api/cron/recordatorios-citas/route.ts`, `lib/citas.ts`, `lib/recordatorios.ts`, `lib/reservas/**`,
`lib/horario.ts`, `components/citas/**`, `components/config/CitasConfig.tsx`,
`app/(app)/citas`, `app/(app)/reservas-en-linea`, `app/api/v1/.../appointments/**`, modelos `Cita`, `Doctor`,
`ServicioReserva`, `HorarioDoctor`, `ExcepcionHorario` en `schema.prisma`, `docs/api-bot.md` (sección Citas),
`MODULOS.md` (cron y citas) y `prisma/scripts/test-reservas-concurrentes.ts`.

### Qué hacer (un commit por tarea)

1. **Diagnóstico escrito primero.** `docs/revision-citas-2026-10-17.md` con tabla hallazgo → archivo:línea →
   gravedad (corrompe datos / seguridad / UX / menor) → qué se hizo. Confirma o descarta cada hallazgo previo
   y añade los que encuentres revisando: validaciones, permisos por puesto, aislamiento entre empresas,
   zonas horarias (inicio/fin en UTC vs zona del negocio, cambio de horario), borrados en cascada
   (`Doctor` desactivado/eliminado con citas futuras), `ServicioReserva` inactivo con citas, textos en
   español, estados vacíos, errores sin detalle técnico al usuario.
2. **Un solo punto de empalme.** Reutiliza `reservarCita`/`reprogramarCita` (o extrae su núcleo a una función
   común en `lib/reservas/servidor.ts`) para que la agenda interna (`POST` y `PATCH /api/citas`) revise
   empalmes del especialista con el mismo bloqueo `FOR UPDATE` y los mismos `ESTADOS_OCUPAN`. Choque → 409 con
   mensaje claro en español. Citas sin doctor no se validan. No cambies el comportamiento de reservas
   públicas ni del bot; sus pruebas actuales deben seguir verdes sin modificarse.
3. **Reprogramación coherente.** Cualquier cambio de `inicio`/`fin`/`doctorId` desde la agenda limpia
   `recordatorioEnviadoAt` y respeta el mismo flujo que el bot. Cambiar a `cancelada`/`no_asistio` libera el
   horario (verifica que `ESTADOS_OCUPAN` ya lo hace) y una cita cancelada/completada **no** se reprograma
   ni se vuelve a `programada` por accidente; define y documenta las transiciones de estado permitidas
   (sin inventar nuevas: solo bloquea las incoherentes, p. ej. `completada` → `programada`) y confirma que
   la solicitud de reseña al completar se dispara una sola vez.
4. **Validación de entrada** en `POST/PATCH /api/citas`: título obligatorio y recortado (también en PATCH),
   longitudes máximas (`titulo`, `notas`), duración máxima razonable (p. ej. 24 h), fechas en rango
   (no años absurdos), ids con `aBigInt`, `contactoId`/`responsableId`/`conversacionId` solo de la empresa
   (`referenciaPropia`). `GET /api/citas`: tope de rango (p. ej. 62 días) y límite de filas; mensaje de error
   claro si se excede. Sin romper la UI (`CalendarioSemanal`, `CitasContacto`).
5. **Cron de recordatorios.** Decide con evidencia y documenta: si el envío falla, ¿se reintenta? Solución
   conservadora: si falla, revertir `recordatorioEnviadoAt` a `null` con un tope de intentos o una marca de
   fallo para no reintentar infinitamente ni spamear; si `take: 100` deja citas sin avisar en la misma
   ejecución, iterar por lotes hasta vaciar o un tope sensato. Respeta la ventana de 24 h/plantillas ya
   existente y que **una empresa con error no detiene a las demás**. Cita sin teléfono o sin canal: se omite
   y se cuenta, sin reclamarla en falso. Pruebas con proveedor simulado.
6. **Reservas en línea (revisión, no rediseño):** disponibilidad contra horarios y excepciones del
   especialista, zona del negocio, `anticipacionMin`, `ventanaDias`, `granularidadMin`, buffer; límite por
   teléfono (`maxPorTelefono`) y por IP; enlace de gestión por token (ver/cancelar/reprogramar): token no
   adivinable, cita ajena inaccesible, cancelar libera el horario, reprogramar respeta empalmes. Doctor o
   servicio desactivado: ya no ofrece horarios pero no rompe citas existentes. Pantalla pública sin datos
   internos de otros clientes (no filtrar nombres/teléfonos de otras citas).
7. **UI de la agenda** (`components/citas/*`, `CitasConfig`, `reservas-en-linea`): revisa en móvil y
   escritorio con la app compilada y datos de fixture: crear, editar, mover, cambiar estado, cancelar,
   doctor sin horario, semana con muchas citas, cita que cruza medianoche, estados de carga y error,
   textos en español, accesibilidad básica (foco, etiquetas, contraste). Corrige solo defectos reales; no
   rediseñes. Toma capturas y guárdalas en `docs/capturas/revision-citas-2026-10-17/`.
7b. **Clínica con varios doctores (caso principal, pruébalo con 5 o más):** la agenda interna debe poder
    verse y filtrarse por doctor (con su color) sin que se mezclen ni se pierdan citas; un doctor desactivado
    con citas futuras no las borra ni las deja huérfanas sin aviso (muéstralas marcadas y permite reasignar);
    la agenda interna **avisa** (no bloquea, decisión de Julio si luego se quiere bloquear) cuando una cita cae
    fuera del horario o en una excepción del doctor, reutilizando `lib/reservas/horarios.ts`; el reparto de
    "cualquiera" en reservas públicas es determinista y reparte parejo entre doctores libres (documenta el
    criterio); servicio ↔ doctores: un servicio sin doctores activos no se ofrece, y reasignar una cita a un
    doctor que no hace ese servicio se avisa; citas sin doctor conviven con las que sí tienen; recordatorios y
    página de gestión por token muestran el doctor correcto; el bot (`appointments`) respeta lo mismo con
    varios doctores; rendimiento aceptable con 10 doctores y ~500 citas en la semana (índices ya existentes).
    Un doctor de la empresa A nunca aparece en la B.
7c. **Tres negocios reales, una misma configuración.** Arma tres fixtures y recorre cada flujo completo en la
    app compilada (móvil y escritorio), de la configuración a la cita completada:
    - **Clínica pequeña** (1–2 doctores, recepción = el dueño): configuración en minutos, sin pasos de más;
      valores por defecto sensatos; todo se puede hacer desde el celular.
    - **Clínica grande** (8+ doctores, varias especialidades, recepción y doctores con puestos distintos):
      filtros por doctor/especialidad/estado, cada doctor ve su propia agenda y recepción ve todas
      (verifica permisos por puesto), carga con cientos de citas por semana, cita a un paciente con su
      expediente, estados `confirmada → en_sala → completada` y `no_asistio` desde la agenda en un toque.
    - **Salón de uñas / belleza** (3–6 técnicas, servicios cortos y largos con `bufferMin`, clientas
      recurrentes, mucha reserva desde Instagram/WhatsApp): servicios con duración y precio, técnica
      "cualquiera", ver el día por técnica, huecos libres, no-shows. El vocabulario de la pantalla no debe
      decir "doctor/paciente" donde el módulo ya admite otro giro: revisa cómo se nombran hoy y, si ya
      existe un mecanismo de etiquetas por giro, úsalo; si no existe, **no lo inventes**: repórtalo.
    Lo que falte para estos tres y no esté en el alcance (p. ej. recursos como sillas o cabinas, varios
    servicios en una sola visita, depósito/anticipo, lista de espera, citas recurrentes, "sin cita"/
    walk-in), **no lo implementes**: lista en el informe qué se necesitaría, qué tan grande es y qué giro
    lo pide, para que Julio decida. Sí corrige los defectos de lo que ya existe.
7d. **Citas en un clic.** Revisa y deja funcionando, sin rediseñar, los caminos de un solo paso, con pruebas:
    - Link público de reservas (`/reservar/[slug]`): copiarlo desde Reservas en línea con un botón, vista
      previa, que cargue rápido en celular, que el cliente complete servicio → especialista (o
      "cualquiera") → horario → datos en pocos pasos y vea confirmación clara con fecha/hora en la zona
      del negocio.
    - Desde la bandeja: agendar desde la conversación (`PanelConversacion` / `FormularioCitaModal`) con
      contacto y conversación precargados, y enviar el link de reservas en la conversación con una
      respuesta rápida o botón (usa lo que ya existe; si no hay forma de insertar el link, repórtalo).
    - Gestión por token: el cliente confirma, cancela o reprograma desde el link que recibe, sin iniciar
      sesión; cancelar libera el horario al instante; link inválido o vencido da mensaje claro.
    - Agenda interna: crear una cita tocando un hueco del calendario (con hora y doctor ya llenos) y cambiar
      estado con un toque; si hoy no se puede, repórtalo en vez de inventar la función.
    - Que el recordatorio incluya el link de gestión solo si la plantilla aprobada ya lo admite (no
      cambies plantillas; Meta debe aprobarlas).
8. **Pruebas nuevas** en `prisma/scripts/test-citas.ts` (y amplía lo existente solo si hace falta):
   crear/editar/mover sin empalme y con empalme (409); concurrencia: dos `POST` simultáneos al mismo doctor
   y hora → solo una gana; reprogramar limpia el recordatorio; transiciones de estado válidas e inválidas;
   validaciones (título vacío, fin ≤ inicio, rango excesivo, ids ajenos); aislamiento entre empresas (A no
   ve ni toca citas de B, ni siquiera por id); permisos por puesto; cron: envía solo a programada/confirmada
   dentro de la ventana, no duplica en ejecuciones simultáneas, falla de envío no pierde la cita, una empresa
   con error no detiene a otra; reservas públicas: límites por teléfono/IP, horario ocupado → 409, token ajeno
   → 404; zona horaria (cita a las 23:30 local no cae en el día siguiente); varios doctores (mismo horario en
doctores distintos sí es válido, "cualquiera" reparte, doctor desactivado con citas futuras, aviso fuera de
horario del doctor). Añade el archivo a la lista de
   pruebas que corre la regresión.
9. **Docs:** actualiza `MODULOS.md` (citas y recordatorios), `docs/api-bot.md` si cambia algo observable por
   el bot (no debería) y la sección "Citas" de la guía de módulos si existe. Una línea en el CHANGELOG/decisiones
   del repo con las reglas de empalme y de estados.
10. **Regresión completa** en la BD desechable (tsc, lint, `prisma validate`, build, `actualizaciones.sql` ×3,
    `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`, todos los `check-*.ts`; si
    añades rutas, actualiza el número fijo en `check-arquitectura-modulos.ts`). Agrega los resultados reales
    (incluidos fallos) a `docs/regresion-pre-merge-2026-10-17.md` en sección nueva con fecha. Retira el
    contenedor. Si algo falla, corrígelo y repite; no sigas al merge con fallos.
11. **Merge local solo si todo pasó:** árbol limpio, `git switch modulos-fase-2`,
    `git merge --ff-only revision-citas`. Si no es fast-forward, detente y repórtalo; sin reset, rebase ni
    merge con commit. **No fusiones en `meta-tech-provider` y no hagas push.**

### Fuera de alcance

Funciones nuevas (listas de espera, citas recurrentes, pagos en línea, Google Calendar, SMS, difusión),
cambios de esquema que no sean imprescindibles para un hallazgo (si hace falta uno: idempotente en
`actualizaciones.sql`, con RLS y GRANT, y repórtalo), WhatsApp/Messenger/Instagram, flujos que revisa Meta
(`api/wa/onboard`, `api/meta/webhook`, `api/meta/templates`, `api/mensajes/enviar`), otros módulos y correr
nada contra producción.

### Entrega (una sola parada)

Tabla de hallazgos (confirmados, descartados, nuevos) con lo corregido y lo que se dejó como decisión de
Julio, tabla "qué falta por giro" (clínica pequeña, grande, salón de uñas) con tamaño estimado de cada
faltante, qué caminos de un clic existen y cuáles no, commits nuevos, resultado de la regresión por prueba, capturas, SHA final de `modulos-fase-2` si el
merge se hizo y lo pendiente de Julio con 🛑 (revisar visualmente la agenda con datos reales de una clínica,
probar un recordatorio real con plantilla aprobada, ensayo con respaldo real y Aurum de pruebas).
