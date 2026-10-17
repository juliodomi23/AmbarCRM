# Prompt para Codex — módulo Servidores (rama `modulos-ar-servidores`)

> **Cuándo correrlo:** `modulos-ar-vistas` ya terminó (adc0836). Pásalo cuando esa rama esté
> fusionada en `modulos-fase-2` (fast-forward posible). Toca los mismos archivos
> (`modulos-catalogo.ts`, `actualizaciones.sql`, `schema.prisma`, `MODULOS.md`) y chocaría si
> corre antes. No depende de que el deploy a producción ya se haya hecho.
> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM/web`). Vas a portar al CRM **solo lo
valioso** del panel interno `docs/08-productos-internos/GestionAmbarRojo` (FastAPI + SQLite, en
línea en `gestor.ambarrojostudios.cloud`): el monitoreo de servidores y sus alertas. Es un panel de
la **plataforma** (Ámbar Rojo), no un módulo para vender a clientes.

### 0. Rama y reglas

- Rama `modulos-ar-servidores` desde `modulos-fase-2` **ya con `modulos-ar-vistas` fusionada**
  (verifica con `git log`; si no está, detente y avísame). Commits `feat(ar): …`.
- Lee primero: `MODULOS.md`, `MULTI-TENANT.md`, `modulos-catalogo.ts`, `actualizaciones.sql`, el
  módulo Contratos/Cobros recién hecho como patrón, y `src/lib/bot-auth.ts` (así se resuelve una
  org a partir de un token de máquina sin sesión).
- Reglas del repo: `org_id` DEFAULT, RLS `org_isolation`, GRANT en `actualizaciones.sql`,
  `requireModuloActivo`, escrituras en `transaccionTenant()`, crons con `x-api-key: WA_API_KEY`.
  Sin dependencias nuevas. Sin push ni deploy.
- **No portes**: credenciales/contraseñas de servidores, tableros, calendario, cronómetro,
  procesos, clientes ni pagos (Contratos y Cobros ya mandan). No toques la carpeta
  `GestionAmbarRojo`; solo léela.

### 1. Qué leer del panel original (solo lectura)

- `backend/app/models.py` → clases `Server` y `Heartbeat`.
- `backend/app/logic.py` → `estado_servidor`, `dias_para` (umbrales: >80 % amarillo, >90 % rojo,
  más de 3 h sin reportar = rojo; "el silencio es la alerta").
- `backend/app/routers/servidores.py` y `alertas.py`.
- `heartbeat/heartbeat.sh` y `n8n/ALERTAS-Diarias-WhatsApp.json`.
- `backend/test_app.py`: los casos de servidores y alertas, para portar sus aserciones.

### 2. Módulo `servidores` (`/servidores`, solo plataforma)

Tablas con `org_id`, RLS y GRANT:

- `servidores`: nombre (único por org), proveedor, IP, `propietario` (quién lo paga: AR / cliente /
  tercero), `lo_pagamos` (bool), `costo_anual_mxn` (Decimal, **solo Administrador lo ve**), `vence`
  (date), `activo`, `ram_total_mb`, `notas`, `heartbeat_token_hash` (sha256; el token en claro se
  muestra **una sola vez** al crearlo o regenerarlo).
- `heartbeats_servidor`: servidor, `fecha`, `ram_pct`, `cpu_pct`, `disco_pct`, `ram_total_mb`,
  `uptime_horas`. Conservar 30 días (limpieza en el cron).
- `cargas` por servidor sin tabla nueva: lista de contratos del CRM ligados al servidor (campo
  opcional `servidor_id` en `contratos`, migración idempotente) más un texto libre para cargas que
  no son un cliente (ej. "App 300 Lugares").

Reglas:

- **Estado** calculado con las reglas de `logic.py`, en una función pura `estadoServidor()` con su
  check. Semáforo verde / amarillo / rojo y motivo escrito ("RAM 78 %", "sin reportar hace 5 h").
- **Heartbeat:** `POST /api/servidores/heartbeat` con header `X-Heartbeat-Token` (token por
  servidor, **no** uno compartido). Resuelve org y servidor por el hash, como `bot-auth.ts`
  (función SECURITY DEFINER; la app sigue sin BYPASSRLS). Valida rangos 0–100 y rechaza
  silenciosamente más de 1 por minuto por servidor. Compatible con el `heartbeat.sh` actual
  cambiando solo la URL; documenta el nuevo `curl`.
- **Pantalla:** tarjetas por servidor (semáforo, RAM/CPU/disco con barra, vence en N días, cargas),
  mini historial de 24 h, alta/edición, regenerar token. Mismos colores de estado que las pantallas
  AR; 375 px y 1440 px sin desbordamiento.
- **Acceso:** solo puesto Administrador y **solo la org de la plataforma**. Revisa cómo el catálogo
  decide qué orgs ven qué módulo (Configuración → Clientes Ámbar CRM); si no existe la noción de
  "solo plataforma", agrégala de la forma más pequeña posible y no lo muestres a ninguna otra org.
  Verifica con una org demo que ni el menú, ni Ctrl+K, ni la API (404) lo exponen.

### 3. Alertas

- `GET /api/panel-ar/alertas` (sesión Administrador **o** `x-api-key: WA_API_KEY` para n8n):
  lista ordenada rojas primero, con `texto` listo para WhatsApp, igual que el original ("Nada en
  rojo hoy" cuando no hay, para distinguirlo de un cron roto).
- Incluye: servidores en rojo/amarillo, servidores que vencen en ≤ 30 días (rojo ≤ 7) solo si
  `lo_pagamos`, y **cobros vencidos** de `cobros` con el **saldo pendiente** (`monto - monto_pagado`,
  desde que existen abonos parciales) y los días de atraso. Reutiliza la función de saldo/cartera que
  ya usa `panel_ar`; no la dupliques. Un cobro pagado en parte y vencido sigue alertando por su saldo;
  los `incobrable` no alertan como vencidos (ya están en cartera aparte).
- El panel AR muestra las alertas arriba. **No envía WhatsApp**: el envío lo hace el flujo de n8n,
  como hoy. Deja actualizado `n8n/ALERTAS-Diarias-WhatsApp.json` apuntando al endpoint nuevo en
  `docs/n8n/` del CRM (sin credenciales dentro).

### 4. Datos iniciales (`scripts/seed-servidores.mjs`)

Idempotente, con `ORG_SLUG` (como `seed-ambar-rojo.mjs` y `ajustes-ar.mjs`, reutiliza su guarda
y helpers de `scripts/lib/`) y la misma guarda `ALLOW_DEMO_SEED=1`. Nunca sobrescribe lo que el
equipo ya editó en la pantalla (si el servidor existe por nombre, lo deja). Para la org `inicial`
el comando futuro será `ORG_SLUG=inicial ALLOW_DEMO_SEED=1 node scripts/seed-servidores.mjs`;
documéntalo igual que lo hizo `ajustes-ar.mjs`, incluida la nota de `NODE_ENV=production`.
Fuente: `docs/11-infraestructura/` y `docs/05-financiero/infraestructura-hosting.md` del repo
padre. Cuatro servidores, **marcando ⚠️ lo que debe confirmarse contra producción**:

| Servidor | Quién lo paga | Cargas |
|---|---|---|
| VPS Ámbar Rojo (KVM 2, `31.220.49.58`) | AR | Coparmex, DeclaraBot, Futura Fortuna (baja), Serénica, App 300 Lugares, panel Gestión |
| VPS Villafuerte (`31.220.51.95`) | Cliente (Lic. Villafuerte) | Villafuerte y Asociados, Dentu |
| VPS Pruebas (`77.37.67.251`) | AR / compartido | entorno dev (no productivo) |
| VPS Pie Feliz (`187.77.20.78`) | AR; **vence marzo 2027** | Pie Feliz (heredado), `ambarcrm_demo`, `novegabienesraices.com` ⚠️ |

No sembrar `ram_pct` ni heartbeats inventados: un servidor sin reportes aparece "sin datos" (gris),
no verde. Imprime los tokens de heartbeat **una sola vez** al sembrar, sin guardarlos en claro.
Pide en el reporte que Julio compare con la base real del panel original antes de dar por buenos
`vence`, `costo_anual_mxn` y cargas (la copia local tenía 5 servidores y 0 pagos; no es producción).

### 5. Pruebas

1. `scripts/check-servidores.ts`: `estadoServidor` (umbrales exactos 80/90, sin reportes, 3 h),
   `diasParaVencer`, texto de alertas con y sin alertas, orden rojas primero.
2. `prisma/scripts/test-aislamiento.ts`: ampliar con `servidores` y `heartbeats_servidor`.
3. `prisma/scripts/test-servidores-e2e.ts`: alta → token mostrado una vez → heartbeat válido →
   estado → token inválido 401 → regenerar invalida el anterior → org no plataforma recibe 404 →
   alertas incluyen un cobro vencido del seed.
4. Todos los `check-*.ts`, la batería `test-*.ts` (único fallo aceptado: `test-lealtad-aurum.ts`),
   tipos, lint, build, y migración aplicada dos veces sobre BD desechable.
5. Capturas de `/servidores` y del bloque de alertas en `/panel-ar` en 375 y 1440 px en
   `docs/capturas/`.

### 6. Entregable

Archivos tocados, salidas literales (lo que falle, primero), el `curl` de heartbeat para instalar en
cada VPS, y la lista de ⚠️. **Sin** push, deploy, envíos reales ni conexión a producción.
Documenta el módulo en `MODULOS.md` al estilo de los demás.
