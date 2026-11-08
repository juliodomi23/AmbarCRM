# Plan de fases · AmbarCRM (actualizado el 26 de octubre de 2026)

Reemplaza como "estado vivo" a las tablas de estado de `PLAN-P0-COMPETITIVIDAD.md` y `PLAN-EQUIPO-APP-MOVIL.md` (esos documentos conservan el detalle de cada fase). Las fechas son propuestas, no compromisos.

## 1. Cerrado hoy (en producción, rama `meta-tech-provider`, commit `7e9b709`)

- **Pagos en línea:** Mercado Pago conectado en la organización 1 (modo prueba); título del cobro con concepto y cliente; **Stripe** (Connect Standard con Account Links) desplegado, con variables cargadas y webhook respondiendo 401 sin firma. Sin cuenta de Stripe conectada todavía.
- **IVA por producto:** tasa 16 % / 0 % / exento por producto, precio con IVA incluido por defecto, snapshots por partida, envío con 16 %, descuento prorrateado, 8 % solo si lo habilita el administrador, integrado en caja (online y sin red), tienda pública, cotizaciones, reportes y CFDI. Ventas anteriores se interpretan como 16 % incluido.
- **Calendario:** Google Calendar por usuario dentro de Citas.
- **Datos de prueba en la organización 1:** módulos Pagos en línea y Ventas activos; producto "Mensualidad" a $1,500.
- **Respaldos de producción** previos a cada cambio, en `/root/backups/` del servidor.
- **Guía para el equipo** (`docs/GUIA-EQUIPO-AMBARCRM.html` y `.md`) con los 36 módulos y todos los planes.

## 2. Estado por fase del P0

| Fase | Tema | Estado | Siguiente paso |
|---|---|---|---|
| 1 | Pagos en línea | Mercado Pago y Stripe desplegados en prueba | Conectar Stripe en la org 1, cobro de prueba con cada uno |
| 1b | IVA por producto | Hecho (Fase A) | Validar con contador: envío, descuento, 8 % y exentos |
| 1c | Comisión de la pasarela (Fase B) | Por hacer; ya se puede empezar (Stripe e IVA están en producción) | Lanzar `PROMPT-PAGOS-IVA-Y-COMISION-CODEX.md`, Fase B |
| 1d | Otros proveedores (Conekta, OpenPay, PayPal, Clip) | Por hacer | Lanzar la Fase 1 (informe) de `PROMPT-PAGOS-OTROS-PROVEEDORES-CODEX.md` |
| 1e | Anticipo de citas | Por definir | Julio define porcentaje o monto, minutos para pagar y política de cancelación; luego prompt |
| 2 | CFDI 4.0 | 2A con timbrado simulado | 2B: cuenta sandbox del PAC (Facturama provisional) y adaptador real |
| 3 | Google Calendar | Hecho | Verificación de Google (video, justificación, dominio) |
| 4 | Email como canal | Por hacer | Prompt de la fase |
| 5 | Integraciones (Zapier / Make) | Por hacer | Parte de lo que ya existe: webhooks salientes y API del bot |
| 6 | Meta Ads y leads reales | 3A interno hecho | Permisos de Meta, luego conexión y leads |
| 7 | Automatizaciones visuales | Por hacer | Depende de la fase 5 |
| 8 | Reportes personalizados | Por hacer | Depende de datos de las fases 1 a 4 |

## 3. Cola de trabajo propuesta

**Semana 1 (26 oct a 1 nov): cerrar cobros y arrancar al equipo**
- Julio: conectar Stripe y hacer el cobro de prueba; cobro de prueba de Mercado Pago; confirmar alcance del webhook de Stripe ("Cuentas conectadas"); crear usuarios del equipo en `demo-meta`; accesos a repos.
- Codex: Fase B (comisión).
- Equipo: onboarding (guía, local con base desechable, primera PR chica).

**Semana 2: comisión, anticipo y base para la app**
- Codex: anticipo de citas (cuando Julio defina las reglas); informe comparativo de proveedores.
- Equipo: endpoint de módulos para la app móvil; rutas de Citas y Cobros con Bearer.

**Semana 3: factura real y revisiones externas**
- CFDI 2B con PAC real en sandbox.
- Video de verificación de Google y revisión de permisos de Meta.

**Semana 4 en adelante:** email como canal, integraciones, automatizaciones visuales y reportes.

## 4. Equipo (propuesta por persona)

El plan original asumía dos personas de Flutter. El equipo real es de web y backend, así que la app móvil queda como proyecto opcional para quien se interese o para Julio.

| Persona | Perfil | Primeras tareas |
|---|---|---|
| Ricardo | Backend | `GET /api/movil/modulos` con lista blanca de módulos con versión móvil; revisar que las rutas de Citas y Cobros acepten el token Bearer; pruebas y revisión de migraciones y RLS. Después, integraciones (Zapier / Make). |
| Antonio | Web, front o back | Módulos web de punta a punta: pulir la interfaz del IVA y la configuración de Pagos en línea; pantalla de resultado de pago; después, la interfaz del anticipo de citas. |
| Pablo | Front o back | Componentes y pantallas de módulos; reportes de IVA; documentación. Si le interesa, la app móvil (Contactos, Tareas, Kanban). |

Reglas: rama por tarea, PR chico, Conventional Commits, Julio revisa y fusiona, nadie hace push a `meta-tech-provider` ni a `main`, pruebas solo en base local desechable.

## 5. Pendientes de Julio

1. Conectar Stripe en la organización 1 y cobrar con la tarjeta de prueba `4242 4242 4242 4242`.
2. Confirmar en Stripe que el destino de webhook tiene alcance **Cuentas conectadas**.
3. Antes de cobros reales: renovar las claves de Stripe que se pegaron en el chat y crear el destino de webhook en modo real.
4. Cobro de prueba completo con Mercado Pago (sandbox).
5. Definir las reglas del anticipo de citas.
6. Consultar a un contador: IVA del envío y del descuento, tratamiento del 8 % y exentos, cargo por servicio.
7. Video de verificación de Google y revisión de permisos de Meta.
8. Accesos del equipo: usuarios en `demo-meta`, repos, canal, Firebase y una Mac para iOS; tipo de cuenta de Google Play.
9. Decidir si `main` se actualiza a producción (hoy va 56 commits atrás) y limpiar las 36 ramas ya fusionadas, sin borrar `codex/menu-digital` ni las ramas en uso.

## 6. Riesgos

- **Stripe sin prueba real:** todas las pruebas usaron un Stripe falso. El primer cobro de prueba puede revelar diferencias con la API real.
- **IVA en un cliente que ya vende:** con la configuración por defecto los totales no cambian, pero toca ventas, caja, CFDI y cotizaciones. Vigilar la primera semana.
- **Julio como cuello de botella de las revisiones:** si hay más de tres PR pendientes, se frena el trabajo nuevo.
- **Verificaciones externas lentas:** Google y Meta no se aceleran con código.
