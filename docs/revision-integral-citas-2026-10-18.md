# Revisión integral de Citas · 18 de octubre de 2026

Base: `d4498f6`. Rama de trabajo: `codex/revision-integral-citas`.
Alcance: agenda interna, configuración de servicios/jornadas/excepciones, reservas públicas,
gestión por enlace, API de citas del bot y recordatorios. Sin despliegue ni servicios reales.

Commits locales de implementación:
- `c33a6ee`: corregir jornadas, empalmes y límites de las reservas.
- `f46773d`: pulir agenda, formularios y contactos precargados.

## Resultado final

54 scripts de prueba y 34 comprobaciones aprobados contra la compilación final,
incluidos aislamiento entre empresas, bot, recordatorios simulados, concurrencia y
la prueba HTTP con más de 500 contactos. TypeScript final, lint de todos los archivos
modificados y Prisma validate aprobados; `actualizaciones.sql` repetido sin errores.
Compilación local Webpack aprobada con fuentes de prueba (véanse sus límites abajo).

- [Resultado individual de la regresión](pruebas-citas-integral-2026-10-18/resumen-regresion.md).
- [Siete capturas y verificaciones visuales](capturas/citas-integral-2026-10-18/README.md).
- [Limpieza de app, contenedor y volumen desechables](pruebas-citas-integral-2026-10-18/limpieza.json).

Queda para operación real: piloto con horarios y duraciones de una clínica/salón,
verificar cron y recordatorio real con plantilla aprobada, compilación normal con
fuentes reales, ensayo con respaldo y despliegue. No se hizo push ni merge a producción.

## Diagnóstico inicial

La revisión anterior ya protege empalmes, estados finales, borrado clínico y aislamiento.
Esta revisión comprueba lo anterior y corrige los siguientes defectos adicionales.

| Hallazgo confirmado por lectura | Evidencia | Impacto | Corrección prevista |
|---|---|---|---|
| Excepciones permiten cierres y aperturas simultáneos; el motor descarta el cierre | `web/src/lib/reservas/horarios.ts`, `api/reservas/excepciones/route.ts` | Agendar durante vacaciones | Cierre prioritario, rechazar contradicciones y ventanas superpuestas |
| Dos altas simultáneas de horario semanal pueden superar el control de empalme | `api/reservas/horarios/route.ts` | Configuración inconsistente | Comprobar y guardar bajo bloqueo del especialista |
| La confirmación pública solo revalida empalme, no cambios de jornada/servicio posteriores a consultar disponibilidad | `lib/reservas/servidor.ts` | Reserva fuera de horario o con servicio retirado | Revalidar disponibilidad y relación dentro del bloqueo |
| Bot mueve citas internas sin incluir buffer del servicio al validar disponibilidad/empalme | `appointments/route.ts`, `lib/reservas/servidor.ts` | Empalme o fin fuera de jornada | Mantener fin visible y añadir margen solo a ocupación |
| Calendario vacío se limita a 8–20 aunque la jornada empiece antes o termine después | `components/citas/CalendarioSemanal.tsx` | Horas válidas inaccesibles | Incluir las jornadas efectivas al calcular el rango |
| El mensaje 409 público se borra al recargar horarios | `components/reservas/ReservaPublica.tsx` | Cliente no sabe por qué falló | Conservar mensaje y actualizar horarios |
| Reservas usa hoy de México en lugar de la zona configurada | `app/(app)/reservas-en-linea/page.tsx` | Excepciones omitidas o fecha equivocada | Usar fecha del negocio |
| Altas/bajas de especialistas no recuperan el formulario si falla la red | `components/citas/CitasCliente.tsx` | Interfaz bloqueada | Manejo de error y finally |

Las correcciones definitivas y los límites comerciales se detallan a continuación.

## Correcciones adicionales durante la revisión

- Un servicio con citas ya registradas no permite cambiar duración ni margen: estos
  campos se usaban al calcular la ocupación de las citas existentes. Se responde 409
  con instrucciones para crear otro servicio. Nombre, precio y visibilidad siguen
  editables. Altas, cambios y borrado se coordinan mediante bloqueos; sin migración.
- La configuración de recordatorios vaciaba el mapeo de variables antes de recibir las
  plantillas por red. Ahora conserva el mapeo guardado, descarta respuestas de canales
  anteriores e informa fallos al guardar. No cambia plantillas de Meta.
- En Tijuana, una hora inexistente por cambio de horario podía normalizarse a otra
  hora. El bot ahora la rechaza; el motor público no ofrece inicios fuera de la ventana
  local. El calendario posiciona los eventos según la hora de pared del negocio.
- Validaciones de configuración rechazan ids fuera de BIGINT, día vacío/null/bool
  y zona IANA inexistente. Las peticiones anteriores sin campo zona siguen funcionando.
- Contactos sin expediente se pueden elegir al crear citas con Clientes/Pacientes
  activo. Editar una cita cuyo contacto no esté entre las primeras 500 opciones conserva
  el contacto original visible. El contacto precargado desde ficha o conversación
  también se incorpora aunque esté fuera de las 500 primeras opciones; se verifica
  aislamiento con un contacto de otra empresa.
- Los formularios reutilizados por Reservas y el catálogo de especialistas recuperan
  sus botones e informan un fallo de conexión. El alta de especialista conserva sus
  datos si falla; solo limpia el formulario cuando se guarda correctamente.
- Prueba móvil: un conflicto mantiene el mensaje y le da foco, para que se vea aunque
  el cliente esté al final de una lista larga de horarios.
- La marca pública ya no usa «Ámbar Rojo» como sustituto de un nombre no configurado:
  prioridad marca explícita > nombre del negocio > nombre de la empresa. Las tres
  variantes tienen prueba de API.
- La agenda usa la etiqueta neutra «Especialistas» también en su catálogo y sus
  estados vacíos. Se conservan especialidad y cédula opcionales, sin renombrar modelos
  ni añadir configuración por giro.
- Las rutas públicas y del bot rechazan ids de servicio/cita fuera de BIGINT antes
  de consultar la base, con 400 en lugar de un fallo interno.

## Compilación local sin proveedores externos

TypeScript, lint y Prisma validate pasan. La regeneración de Prisma simultánea a
pruebas falló con EPERM de su DLL en Windows; un intento posterior imprimió generación
correcta pero terminó por timeout. Se conserva el resultado real, sin declararlo aprobado.
Turbopack se detuvo sin completar. Webpack detectó descargas de Google Fonts bloqueadas
por el arnés sin red. Se usa el mecanismo de pruebas de Next
`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` con Arial local y Webpack: la compilación posterior
aprobó. Es una condición exclusiva del arnés; no se cambiaron las fuentes del producto
ni el comando normal de despliegue. Las capturas verifican distribución y flujos con
esa tipografía sustituta. La compilación normal con fuentes reales debe comprobarse
en el entorno de despliegue.

La primera prueba de precarga intentó invocar una página Next directamente desde
Node y falló por interoperabilidad ESM/CommonJS de `CredentialsProvider`, fuera del
servidor Next. Se conserva el fallo en los logs y se mueve esa comprobación a
`test-citas-precarga-e2e.ts`, mediante HTTP y sesión real contra la app compilada.
No se cambió autenticación para acomodar la prueba.

## Reglas de operación que se conservan

- Con jornada semanal, la cita y su margen caben completos en una ventana efectiva;
  sin jornada, la agenda interna permite guardar con aviso. Reservas públicas y bot
  siempre exigen disponibilidad. Cambiar una jornada no cancela citas ya existentes.
- Citas sin especialista pueden coincidir. Cancelada/no-asistió liberan horario;
  los estados finales no se reabren. El borrado conserva historial clínico y reseñas
  conforme a las reglas anteriores.
- El bot conserva especialista, duración y origen al mover. El margen de una cita
  interna se añade solo al bloqueo, mientras que las reservas bot/públicas ya lo guardan
  en `fin`. Se revalida bajo transacción, sin sumar dos veces.
- La gestión por token consulta/cancela. Confirmar/reprogramar públicamente y el
  vínculo usuario–especialista continúan fuera del producto actual.

## Alcance comercial y prueba piloto

| Negocio | Cobertura técnica | Límite que debe conocer el comprador |
|---|---|---|
| Clínica pequeña | Agenda, turnos partidos, cierres, servicios, enlace público y recordatorios | Probar horario real y plantilla aprobada antes de activarlo |
| Clínica con varios especialistas | Filtros, colores, empalmes, paginación y puestos con acceso al módulo | Un puesto autorizado ve la agenda de toda su empresa; no existe vínculo usuario–especialista |
| Salón de belleza | Especialista o cualquiera, duración y margen, reservas y no-asistió; etiqueta interna «Especialistas» | No hay recursos/sillas ni varios servicios por visita |

El selector inicial carga hasta 500 contactos; desde ficha/conversación se añade el
contacto precargado aunque exceda ese límite. Para catálogos mayores falta búsqueda
directa desde el formulario de Citas. Las pruebas no acreditan entregabilidad real de WhatsApp,
rendimiento de producción ni un ensayo de migración con respaldo real. El despliegue y
esas comprobaciones siguen pendientes; no se tocaron producción ni otros servicios.
