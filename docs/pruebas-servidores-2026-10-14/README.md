# Entrega · servidores AR · 2026-10-14

## Fallo pendiente (primero)

Único fallo final: **`test-lealtad-aurum.ts`**, previsto por la solicitud.
Salida literal:

```text
FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba
EXIT 1
```

[Stack completo](test-lealtad-aurum.txt). Requiere un Aurum real de pruebas;
las cuatro variables AURUM quedaron vacías y no hubo conexión a producción.
**32 checks pasaron; 36 de 37 tests pasaron**, incluida la E2E de servidores.
[Resumen final de todos los tests](test-final-resumen.txt) ·
[Resumen de checks](checks-resumen.txt).

## Implementación

Rama `modulos-ar-servidores` desde `modulos-fase-2` en `adc0836`. La referencia
`modulos-ar-vistas` apunta a ese mismo commit: el historial requerido estaba
integrado antes de comenzar. Los cuatro prompts locales que ya existían sin
seguimiento se dejaron fuera de los commits.

- Servidores, heartbeats, RLS, DEFAULT org_id y GRANT. Las FK compuestas impiden
  ligar contratos o reportes con servidores de otra org.
- Módulo solo plataforma (id=1) y puesto Administrador. Menú, Ctrl+K y configuración
  filtran el catálogo; API 404 para otra org incluso con activación equivocada.
- Token aleatorio por servidor, solo SHA-256 en BD; alta/regeneración muestran el
  token una vez, sin hash/token en lecturas y sin caché de las respuestas de token.
- Ingesta compatible con las métricas snake_case del script original, resolución
  SECURITY DEFINER, revalidación de hash bajo bloqueo y límite por servidor en BD.
- Semáforo original: RAM/disco >=80 amarillo, >=90 rojo; CPU informativa;
  >3 h sin reportar rojo; primer reporte pendiente gris. Motivo visible.
- Tarjetas, barras, mini historial 24 h, altas/ediciones, regeneración y cargas.
  Contratos se vinculan al editar desde Servicios contratados; cargas ajenas al CRM
  quedan como texto libre. Costo solo se entrega al puesto Administrador.
- Alertas arriba del panel y endpoint de sesión/key, orden rojas primero,
  renovaciones solo si lo pagamos y deuda por saldoCobro(), sin duplicar cartera.
  Incobrables/pagados/cancelados no se reportan como vencidos.
- Cron de retención 30 días con WA_API_KEY. Conserva ultimo_reporte para detectar
  silencio incluso después de eliminar el histórico completo.
- Seed de cuatro servidores, idempotente, guarda compartida y tokens impresos
  únicamente tras confirmar la transacción. Workflow n8n inactivo sin secretos.

No hubo push, deploy, envío real ni conexión a los VPS/servicios de producción.
GestionAmbarRojo se leyó únicamente; ninguna de sus carpetas fue modificada.
No se añadieron dependencias. Toda la BD usada fue **crm_servidores**, creada
vacía con el esquema de la BD desechable local en 127.0.0.1:55453. No se alteró
la BD `crm` ni las otras bases locales. La app de pruebas quedó accesible en 3128.

## Verificación y salidas literales

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Todos los check-*.ts | 32, fallos 0 | [checks](checks-resumen.txt) |
| Batería test-*.ts | 37, único fallo Aurum | [resumen final](test-final-resumen.txt) |
| Aislamiento | 80 tablas | [salida](test-aislamiento.txt) |
| Tipos | EXIT 0 | [salida](tipos.txt) |
| Lint | EXIT 0, sin warnings | [salida](lint.txt) |
| Build de la versión final | EXIT 0 | [salida](build.txt) |
| Migración aplicada dos veces | EXIT 0 / EXIT 0 | [primera](migracion-1.txt), [segunda](migracion-2.txt) |
| Guarda/idempotencia del seed | EXIT 0 | [salida](seed-idempotencia.txt) |
| Capturas/navegador | EXIT 0, sin errores | [salida](capturas.txt), [medidas](visual.json) |

```text
servidores: límites exactos 80/90, 3 h, silencio tras limpieza, sin datos gris, fechas, vencimientos 7/30, WhatsApp vacío y orden, rangos y plataforma OK
OK · aislamiento de lectura y escritura en 80 tablas
servidores E2E: alta/token único, sin datos, rangos, heartbeat concurrente 201/204/204, estado rojo, edición/cargas, rotación 401/201, demo catálogo oculto/API 404/página sin datos, puesto 403, saldo parcial del seed y atraso, incobrable excluido, n8n key 401/200, retención 30 días OK; cero envíos
TOTAL 37; FALLOS 1
```

El rol de app sigue sin privilegios de bypass:

```text
crm_app|f|f
servidores|t
heartbeats_servidor|t
```

[Consulta literal](rls.txt): columnas rolname / rolsuper / rolbypassrls y tabla / RLS.
[Respuesta HTTP real sin alertas](alertas-vacias-http.txt) devuelve HTTP 200,
lista vacía y «Nada en rojo hoy. 🟢»; se probó con key de pruebas local.
[Estado final de BD](estado-final-bd.txt): cuatro servidores, cero heartbeats;
los fixtures visuales se borraron y el cobro parcial simulado se restauró.

Errores encontrados y corregidos, conservando las salidas originales:

- [Lint inicial](lint-inicial-corregido.txt): lectura de Date.now() en render;
  el instante del historial ahora viene del servicio.
- [Primera E2E](test-servidores-e2e-inicial-corregido.txt): heartbeat recibía 307
  porque el proxy exigía sesión. Se añadieron excepciones exactas para heartbeat
  y alertas; ambos endpoints validan su autenticación. check-proxy cubre que
  rutas parecidas y las APIs de administración sigan protegidas.
- [Segundo intento E2E](test-servidores-e2e-stream-corregido.txt): el test esperaba
  HTTP 404 de una página cuyo stream ya había enviado 200. Se verificó el contenido
  notFound y la ausencia de datos. **Las APIs sí responden HTTP 404**, como requiere
  el prompt. La pantalla no expone tarjetas. La prueba final pasó.
- [Resumen HTTP inicial](http-inicial-resumen.txt): diez tests pasaron y falló
  servidores por lo anterior. Se volvió a ejecutar ese test tras las correcciones;
  [salida final](test-servidores-e2e.txt). El resumen final combina las salidas finales
  de los 37 archivos, no oculta el intento inicial.
- Prisma generate tuvo inicialmente EPERM por la DLL que usaba el servidor Next
  de pruebas anterior. Se detuvo ese servidor local y la generación pasó.

## Capturas

Se revisaron visualmente las cuatro vistas obligatorias y el formulario.
Document width y contenido width coinciden con su viewport/contenedor en ambos
anchos; no hubo errores JavaScript. Los estados/cobro de las imágenes son fixtures
simulados exclusivamente locales, no telemetría ni deuda de producción.

- [Servidores 375](../capturas/servidores-2026-10-14/servidores-375.png)
- [Servidores 1440](../capturas/servidores-2026-10-14/servidores-1440.png)
- [Alertas/panel 375](../capturas/servidores-2026-10-14/panel-ar-375.png)
- [Alertas/panel 1440](../capturas/servidores-2026-10-14/panel-ar-1440.png)
- [Formulario 375](../capturas/servidores-2026-10-14/servidor-formulario-375.png)
- [Formulario 1440](../capturas/servidores-2026-10-14/servidor-formulario-1440.png)
- [Demo Ctrl+K sin Servidores](../capturas/servidores-2026-10-14/demo-ctrl-k-1440.png)

## Instalación futura del heartbeat en cada VPS

En el heartbeat.sh existente conservar RAM/CPU/disco/uptime, header y JSON.
Cambiar la URL anterior con SERVER_ID por la siguiente URL; TOKEN debe ser el
nuevo token exclusivo del servidor, copiado al crear/regenerar en el CRM:

```sh
# CRM: URL de AmbarCRM. TOKEN: exclusivo del VPS donde se instala este cron.
curl --fail-with-body -sS -X POST "$CRM/api/servidores/heartbeat" \
  -H "Content-Type: application/json" \
  -H "X-Heartbeat-Token: $TOKEN" \
  -d "{\"ram_pct\":${RAM:-0},\"cpu_pct\":${CPU:-0},\"disco_pct\":${DISCO:-0},\"ram_total_mb\":${RAM_TOTAL:-0},\"uptime_horas\":${UPTIME:-0}}"
```

Instalar por separado en **31.220.49.58**, **31.220.51.95**, **77.37.67.251** y
**187.77.20.78**, cada uno con su token. No reutilizar el token compartido del
panel anterior. Los reportes válidos responden 201; repetidos antes de un minuto,
204 sin cuerpo; inválidos 401. No se ejecutó ninguno de estos comandos en VPS.

Programar diariamente en n8n POST `/api/cron/limpiar-heartbeats` con una credencial
header x-api-key: WA_API_KEY. La consulta diaria es GET `/api/panel-ar/alertas`.
Importar [el workflow](../n8n/ALERTAS-Diarias-WhatsApp.json), configurar AMBARCRM_URL,
seleccionar credencial HTTP Header Auth y conectar el envío del equipo. No se
incluyó ni ejecutó un envío real.

## Seed futuro y datos por confirmar ⚠️

Desde web, para la org real cuyo slug es inicial:

```sh
ORG_SLUG=inicial ALLOW_DEMO_SEED=1 node scripts/seed-servidores.mjs
```

Como ajustes-ar.mjs, **NODE_ENV=production bloquea el comando incluso con la guarda**.
Una carga futura deliberada debe usar NODE_ENV sin definir/development, org destino
explícita y respaldo previo. Aquí no se ejecutó contra la org real. Los tokens se
muestran una sola vez; no guardar esa salida en logs compartidos. En la segunda
pasada de prueba no se imprimieron tokens ni se alteró ninguna edición/activación.

**Julio: compara vence, costo_anual_mxn y cargas con la base real del panel original
antes de dar el seed por bueno. La copia local tenía cinco servidores y cero pagos;
no era producción.**

- ⚠️ Ámbar Rojo: KVM 2 y fecha 2027-05-11 vienen del documento histórico. Confirmar
  renovación y costo real; todos los costos del seed quedan NULL.
- ⚠️ Pie Feliz: **vence marzo 2027**, falta el día exacto, por eso vence queda NULL
  con la nota del mes. Confirmar ambarcrm_demo y novegabienesraices.com.
- ⚠️ Villafuerte: paga el cliente. Confirmar vencimiento/costo con él; no genera
  alerta de renovación pagada por AR.
- ⚠️ Pruebas: AR/compartido, entorno no productivo. Confirmar reparto, costo y fecha.
- ⚠️ Cargas de todos los VPS: validar contra producción, incluida Futura Fortuna
  en baja, panel Gestión y App 300 Lugares. Coparmex aparece en texto porque es
  una alianza sin contrato; no se inventó un contrato ni deuda para vincularlo.
- ⚠️ Revisar token de cada VPS e importar/configurar n8n antes del uso real.

## Archivos tocados

[Lista completa](archivos-tocados.txt), incluidos salidas literales y capturas.
Los principales cambios están en Prisma/SQL, catálogo/acceso, proxy, servicios
servidores/alertas, rutas, componentes AR, selector de contrato, seed y tres pruebas.
El módulo también quedó documentado en [MODULOS.md](../../MODULOS.md).

Para reproducir: ejecutar-pruebas.ps1 -Tipo checks/db/http con la base desechable
indicada en el script; iniciar-app-local.ps1 sirve el build. capturar.mjs requiere
PLAYWRIGHT_MODULE del runtime local y Edge; verificar-seed.mjs solo admite la BD
crm_servidores. Las credenciales documentadas en estos scripts son ficticias locales.
