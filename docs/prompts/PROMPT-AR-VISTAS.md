# Prompt para Codex — pulido de vistas AR, cobros y embudo

> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM/web`). Los módulos Contratos, Cobros y
Panel AR ya están en `modulos-fase-2` y corriendo en la org `inicial` (la de la plataforma, de
Julio). Hay que pulir lo que ve y hace Julio todos los días. **No agregues módulos, tablas ni
dependencias nuevas**; reutiliza los componentes, el Modal/Confirmador y las reglas ya hechas.

### 0. Rama y reglas

- Crea `modulos-ar-vistas` desde `modulos-fase-2`. Commits pequeños `feat(ar): …` / `fix(ar): …`.
- Mismas reglas de siempre: `Prisma.Decimal` en servidor, escrituras con `transaccionTenant()` y
  bloqueo, RLS intacto, nada de WhatsApp real. Si un cambio de comportamiento rompe un check o test
  existente, **actualiza el test con el motivo**, no lo borres.
- Sin push ni deploy. Julio los hace.

### 1. Contratos: ocultar bajas y limpiar Pie Feliz

1. `/contratos` **no muestra por defecto** los contratos en `baja` ni `incobrable`. Añade un
   interruptor visible "Mostrar bajas" (estado en la URL, `?bajas=1`) que los incluye, atenuados.
2. Los totales y contadores de esa pantalla indican cuántos hay ocultos ("3 en baja ocultos").
3. El panel y los reportes **siguen contando** incobrables en cartera (no cambies esa lógica).
4. **Quitar la web de Pie Feliz:**
   - En `scripts/seed-ambar-rojo.mjs` elimina el contrato `web` de Pie Feliz (el de $2,000).
   - Como el seed no sobrescribe, crea `scripts/ajustes-ar.mjs`, idempotente, con `ORG_SLUG` y la
     misma guarda `ALLOW_DEMO_SEED=1` del seed, que borre **solo** el contrato `tipo=web` del
     contacto "Pie Feliz" y sus cobros, dentro de `transaccionTenant`/org fija. Debe imprimir qué
     borró y no hacer nada en la segunda corrida. Ese mismo script hará el resto de ajustes de datos
     de la sección 4.

### 2. Verde para producción y más vista en general

- Estados con color consistente en las tres pantallas (un solo mapa de estado → color, reutilizado):
  `produccion` **verde**, `en_desarrollo`/`en_pruebas` ámbar/azul, `pausado` gris, `baja`/`incobrable`
  rojo atenuado. Cobros: `pagado` verde, `pendiente` neutro, `vencido` rojo, `incobrable` rojo
  oscuro, `cancelado` gris tachado.
- Los contratos en producción se distinguen de un vistazo: franja o borde verde a la izquierda en la
  tarjeta/fila y el badge.
- Mejor jerarquía en `/contratos`: tarjetas o filas con nombre del cliente grande, servicio,
  mensualidad destacada y "cobra el día X" / "sin día de cobro" visible; agrupadas por estado
  (Producción primero, luego Desarrollo/Pruebas, luego Pausados).
- `/cobros`: agrupa por "Vencidos", "Esta semana", "Este mes", "Después", "Pagados"; el importe y la
  fecha de vencimiento son lo más visible; vencido en rojo con "hace N días".
- `/panel-ar`: tarjetas de KPI más grandes (MRR, por cobrar vencido, cobrado del mes, clientes en
  producción), con el mismo código de color; barras simples en CSS/SVG para cobrado vs por cobrar
  del mes y pipeline por etapa. Sin librerías de gráficas.
- Móvil (375 px) y escritorio (1440 px) sin desbordamiento horizontal. Contraste AA en los badges.

### 3. Registrar cobros y acciones a la vista

El flujo debe ser evidente, no escondido en un editor:

1. **"Registrar pago"** botón primario en cada cobro abierto (en `/cobros`, en el detalle del
   contrato y en las listas del panel): modal con monto (precargado, editable solo si es menor/igual
   y deja saldo explícito), fecha de pago (hoy por defecto), método y referencia. Usa la misma ruta
   idempotente de pago existente.
2. **"Nuevo cobro"** en `/cobros` y en cada contrato: concepto (`mensualidad`, `anticipo`,
   `balance`, `extra`), periodo si es mensualidad, monto, vencimiento. Respeta el único
   `(contrato_id, concepto, periodo)` y muestra un error claro si ya existe.
3. Acciones secundarias en un menú por cobro: definir/cambiar vencimiento, recordar por WhatsApp
   (manual, como ya está), cancelar, marcar incobrable (solo Administrador, con nota).
4. En el contrato: acciones **"Pasar a producción"**, **"Pausar"** y **"Dar de baja"** (pide fecha
   de baja y cancela los cobros pendientes futuros con confirmación). Un cliente dado de baja deja
   de aparecer por la regla de la sección 1.
5. Confirmaciones y toasts claros; nada se guarda sin que se vea el resultado en la lista.

### 4. Embudo: que aparezcan todos

El embudo "Comercial Ámbar Rojo" hoy solo muestra prospectos y dos ganados. Debe mostrar **todos**
los clientes y prospectos:

- Cada contacto con contrato en `produccion`, `en_desarrollo` o `en_pruebas` tiene una oportunidad
  en etapa **Ganado** (valor = `monto_cierre` si existe; si no, la mensualidad × 12 y dilo en el
  título/nota "valor anual"). Si no hay monto ni mensualidad, valor 0.
- Los contactos en `baja` o `incobrable` aparecen en **Perdido** con `motivo_perdida` ("Baja
  2026-07-08", "Cierre incobrable", etc.), para tener todo el historial sin ensuciar Contratos.
- Los prospectos siguen en Prospecto/Contactado/Cotizado/Negociación.
- Alianzas (Coparmex) quedan fuera del embudo.
- Esto lo hace `scripts/ajustes-ar.mjs` (idempotente: busca por contacto + título, no duplica) y se
  replica en el seed para instalaciones nuevas.
- Verifica que la vista de Embudo/Oportunidades de la org `inicial` abre **este** embudo por
  defecto o ofrece un selector visible, y que no hay un límite de tarjetas por columna que oculte
  alguna (hoy son ~20; recuerda la lección de volumen: lista con límite y búsqueda en servidor, sin
  recortar silenciosamente).

### 5. Pruebas

1. Actualiza `scripts/check-contratos-cobros.ts` con: ocultar bajas/incobrables por defecto, mapa de
   estado → color, y la regla de valor de las oportunidades del embudo.
2. Amplía `prisma/scripts/test-cobros-e2e.ts`: registrar pago desde la UI (ruta), crear cobro
   manual, duplicado rechazado, dar de baja cancela pendientes futuros, la baja desaparece de la
   lista y aparece con `?bajas=1`.
3. Corre `scripts/ajustes-ar.mjs` **dos veces** sobre una BD desechable con el seed: conteos
   idénticos la segunda vez, otras orgs intactas, Pie Feliz sin contrato web y embudo con todos.
4. Corre tipos, lint, build, **todos** los `check-*.ts` y la batería `test-*.ts` (el único fallo
   aceptado es `test-lealtad-aurum.ts`, que pide un Aurum real).
5. Capturas de `/contratos`, `/cobros`, `/panel-ar` y el embudo en 375 y 1440 px en
   `docs/capturas/ar-vistas-<fecha>/` y nota en `docs/revision-visual-<fecha>.md`.

### 6. Entregable

Archivos tocados, salidas literales de cada prueba (lo que falle, primero), capturas, y el comando
exacto para correr `ajustes-ar.mjs` en el contenedor de la app con `ORG_SLUG=inicial`. **No** hagas
push, deploy, ni toques ninguna BD que no sea la desechable.
