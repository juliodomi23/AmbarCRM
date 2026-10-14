# Contratos, Cobros y Panel Ámbar Rojo

Rama `modulos-ar`, creada desde `modulos-fase-2` (9f147e1). Trabajo local;
sin despliegue, push, envíos reales ni acceso al chat de Villafuerte.

**Implementación guardada. Pendiente: repetir la integración HTTP y de los
diálogos contra el último build después del reinicio solicitado de la app.**

## Implementación y decisiones

- Dos tablas: `contratos` y `cobros`, con DEFAULT de organización, RLS,
  permisos de `crm_app`, índices y migración idempotente en `actualizaciones.sql`.
  `schema.sql` base y las rutas de revisión de Meta permanecen sin cambios.
- Tres módulos del área Ámbar Rojo. Acceso por defecto de Administrador;
  no hay un puesto Socio existente que se pueda reutilizar. La migración y
  el seed guardan esos permisos, incluso después de reaplicar el SQL.
- Dinero con `Prisma.Decimal`, cierre con anticipo y balance exactos,
  pago idempotente con bloqueo y cron protegido por API key. Los cargos de
  cierre tienen un índice único parcial: PostgreSQL admite múltiples NULL
  en un UNIQUE normal y el periodo de esos cargos debe quedar NULL.
- El cron genera el mes siguiente y marca vencidos; no importa ningún servicio
  de envío. Recordatorios solo manuales, respetando ventana y plantilla aprobada.
- Panel sin tabla nueva: MRR, proyección, clientes únicos, cartera, calendario,
  pipeline abierto sin probabilidades, comisiones y CSV protegido.
- Crédito IA una vez por cliente y mes de servicio: los dos contratos de
  Villafuerte comparten $100, incluso si se liquidan en meses diferentes.
  Los extras no tienen porcentaje definido en el prompt; quedan fuera del
  reparto con aviso explícito, aunque sí cuentan como ingreso cuando se pagan.
- Los estados, montos, porcentajes y fechas no confirmados admiten vacío.
  Un pago histórico sin fecha/método se conserva como pagado pero no se atribuye
  al mes actual. Su cierre se registra completo, sin inventar un desglose de anticipos.
- Los cargos nuevos de anticipo y balance quedan sin vencimiento hasta confirmar
  la fecha. Cobros permite definirla o cambiarla mientras el cargo siga abierto.
  Modificar un contrato con historial no reescribe cargos ni cambia su cliente.
- `Nota` necesita una oportunidad: las dudas con su origen se conservan en
  `Contacto.notas` y en el contrato. Tareas es una pantalla base, no otro módulo.
  Las tareas «definir monto» dicen «Para CEO» y quedan sin asignar porque
  no se importó ni se inventó un usuario real del CEO.
- No se añadieron dependencias. La revisión visual encontró que los modales
  se recortaban dentro de las filas animadas. `PanelListado` omite la animación
  y el recorte en los listados editables, reutilizando el Modal y Confirmador
  existentes sin cambiar esos componentes.

## Datos sembrados y dudas de negocio

El seed inicial creó 18 contactos, 11 contratos, 6 cobros históricos, el embudo
con sus seis etapas, 10 oportunidades y 7 tareas. Después de ejecutar el cron
hay 10 cobros (se añadieron 4 mensualidades). Cinco nuevas ejecuciones del seed
mantuvieron los conteos, el MRR y la contraseña existente. No crea canales,
conversaciones ni teléfonos/correos de clientes; esos datos quedan NULL para
evitar tanto datos personales reales como duplicados de un teléfono ficticio único.

MRR del seed: **$4,400**, incluyendo la producción provisional de Dentu.
Alwater queda con estado pendiente y sin día/inicio; no genera mensualidades ni
entra al MRR actual. El día de cobro controla la generación, no altera la regla
general de MRR (producción e inicio cumplido).

| Confirmación pendiente | Tratamiento actual |
|---|---|
| Dentu: producción y cierre pagado/sin saldo; importe histórico | Producción provisional según el prompt; cierre vacío y duda visible en notas. |
| Alwater: estado, día e inicio de mensualidad | $12,000 pagados completos según usuario; mensualidad $1,500 sin generar cargos. |
| Exi: anticipo recibido (importe y porcentaje), balance y vencimiento; mensualidad | Cierre $12,000, oportunidad ganada; porcentaje vacío. No se inventan cargos numéricos para el anticipo/balance desconocidos. El saldo pendiente queda documentado en notas y no se suma a cartera hasta confirmarlo. |
| SEMBID: estado, mensualidad, día e inicio | Trueque $0 y oportunidad ganada con valor 0; mensualidad vacía. La cotización histórica ($10,500 / $1,500 mes) no reemplaza el acuerdo actual. |
| Futura Fortuna: fecha de baja y cifras históricas pagadas | Baja sin pendientes; fecha y montos vacíos. |
| Colegio de Arquitectos: alcance completo o fase 1; confirmar envío | Oportunidad en Cotizado por $15,000 de la propuesta completa; alternativa $10,000 conservada en notas. |
| Energía Cero, Rubí, Leyva, CrmLite, Tour, Porfirio y VendoApp: importe definitivo | Valor 0 y tarea «definir monto»; no se usan presupuestos estimados, paquetes vencidos ni precios de tours como cierres de AR. |
| Fechas/métodos de los cierres históricos ya pagados | Vacíos; fuera de «cobrado del mes». |
| Comisión de cobros extra | Reparto por definir, sin suponer 70/30 ni 50/50. |

Las instrucciones actuales prevalecen sobre el índice de junio: Serénica ya está
en producción; Pie Feliz está de baja desde 2026-07-08 y su web está pagada;
Huipix tiene $4,000 incobrables y baja 2026-06-22; SEMBID es trueque; Alwater
ya está pagado completo. No se trasladó un saldo antiguo contradicho por el usuario.

## Validación y resultados literales

PostgreSQL 16 desechable: contenedor `ambarcrm-ar-prueba`, puerto local 55453.
Se creó con `schema.sql` + `multi-tenant.sql`; la migración final se aplicó
tres veces con salida 0. La app se probó con `next start` en 127.0.0.1:3127.

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Exit 0, sin avisos. |
| `npx tsc --noEmit` | Exit 0, sin salida. |
| `npx prisma validate` | Exit 0: `The schema at prisma\schema.prisma is valid 🚀`. |
| `npx next build` | Exit 0; compilación, tipos y 55 páginas generadas. |
| Todos los `scripts/check-*.ts` | `TOTAL 31; FALLOS 0`. |
| Concurrencia sin protección | Exit 1 esperado: 2 pagos aplicados y 2 mensualidades. |
| Concurrencia con protección | Exit 0: 1 pago aplicado y 1 mensualidad. |
| Aislamiento | Exit 0: lectura y escritura aisladas en 78 tablas. |
| Datos de cobros + regresión de referencias/cupos/retail/reservas | Todos con Exit 0. |
| E2E real, flujo base | Pasó con login `orgSlug`, contrato → anticipo/balance → cron → mensualidad → pago; MRR 4500 y cobrado 150.01; permisos y aislamiento bidireccional. |
| E2E final ampliado | Pendiente de reiniciar el proceso del puerto 3127. La configuración vacía recibe código anterior (`500 !== 400`); faltan los casos HTTP de vencimiento vacío y edición de fecha. Las funciones y transacciones finales pasan en los checks y pruebas de BD. |

Las salidas completas, sin resumir cada prueba, están en:

- [31 checks](pruebas-ar-2026-10-13/checks.txt).
- [Pruebas de base de datos y regresión](pruebas-ar-2026-10-13/base-datos.txt).
- [Vencimientos por confirmar y edición de fecha](pruebas-ar-2026-10-13/cobros-datos.txt).
- [Última ejecución HTTP sobre el servidor anterior](pruebas-ar-2026-10-13/e2e-servidor-anterior.txt).
- [Repetición HTTP tras el aviso de Ready](pruebas-ar-2026-10-13/e2e.txt):
  aún sirve la versión anterior y falla con `500 !== 400`.
- [Sin protección](pruebas-ar-2026-10-13/concurrencia-sin-proteccion.txt) y
  [con protección](pruebas-ar-2026-10-13/concurrencia-con-proteccion.txt).
- [Migración repetida](pruebas-ar-2026-10-13/migracion.txt) y
  [seed repetido](pruebas-ar-2026-10-13/seed.txt).
- [Lint](pruebas-ar-2026-10-13/lint.txt), [tipos](pruebas-ar-2026-10-13/tipos.txt),
  [Prisma](pruebas-ar-2026-10-13/prisma.txt), [build final](pruebas-ar-2026-10-13/next-build.txt).

### Fallos intermedios resueltos

La reaplicación del SQL detectó un acceso indebido del Agente (`200 !== 403`):
el backfill antiguo usaba una lista vacía para cualquier módulo no enumerado.
Se corrigió el CASE para los tres módulos y el seed guarda Administrador explícito.
La prueba HTTP pasó después de reaplicar la migración tres veces.
Se conserva [la salida del fallo](pruebas-ar-2026-10-13/e2e-fallo-permisos-migracion.txt).

`npm run build` pasó en la primera compilación. Su repetición con la app abierta
falló por `EPERM` al intentar reemplazar la DLL de Prisma que Windows tenía
en uso ([salida](pruebas-ar-2026-10-13/build.txt)). El cliente ya estaba generado;
la compilación final con `npx next build`, los tipos y `prisma validate` pasaron.

La revisión automática rechazó el arranque desde herramientas (`blocked by policy`);
el usuario inició/reinició el servidor local para permitir las pruebas HTTP.
La última comprobación encuentra el proceso 56660 iniciado a las 19:39, anterior
al build final de las 21:31. Está solicitado reiniciar ese proceso en el puerto 3127.

## Límites de la verificación

No se probó un envío real de WhatsApp: está prohibido en esta entrega. La prueba
sin canal devuelve 409 y los checks confirman que cron y seed no importan emisores.
No se ejecutó toda la batería histórica `prisma/scripts/test-*.ts` de los otros
módulos: se corrió la regresión compartida pertinente y todos los checks.
No se verificó en un teléfono físico ni con lector de pantalla.

Las capturas y comprobaciones visuales se documentan en
[la revisión visual](revision-visual-2026-10-13.md).

## Archivos tocados

- `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`:
  modelos, restricciones, aislamiento y permisos por defecto de AR.
- `web/src/lib/modulos-catalogo.ts`, `contratos-cobros.ts`, `contratos-db.ts`,
  `cobros-db.ts`, `cobros-envio.ts`, `panel-ar-db.ts`, `campos-ar.ts`:
  catálogo, reglas puras, transacciones, recordatorio manual, consultas y campos.
- `web/src/lib/rutas-edicion.ts`: reutilizar el manejo común de errores de negocio
  también con `ErrorRetail`, sin crear otro envoltorio de APIs.
- `web/src/app/api/contratos/route.ts`, `contratos/[id]/route.ts`:
  alta, listado, consulta y edición.
- `web/src/app/api/cobros/route.ts`, `cobros/[id]/route.ts`,
  `cobros/[id]/recordar/route.ts`, `cobros/ajustes/route.ts`:
  cargos, pagos/estados, envío manual y plantilla.
- `web/src/app/api/panel-ar/route.ts`, `panel-ar/ajustes/route.ts`,
  `panel-ar/exportar/route.ts`, `cron/generar-cobros/route.ts`:
  indicadores, reparto, exportación y generación por empresa.
- `web/src/app/(app)/contratos/page.tsx`, `cobros/page.tsx`, `panel-ar/page.tsx`,
  `web/src/components/ar/RecordarCobro.tsx`: las tres pantallas y la acción manual.
- `web/src/components/modulos/PanelListado.tsx`: evitar recortes del formulario de edición.
- `web/scripts/seed-ambar-rojo.mjs`, `check-contratos-cobros.ts`,
  `check-arquitectura-modulos.ts`: datos iniciales, validación y 93 rutas de módulo.
- `web/prisma/scripts/test-cobros-db.ts`, `test-concurrencia-cobros.ts`,
  `test-cobros-e2e.ts`, `test-aislamiento.ts`: pruebas nuevas y cobertura de tablas.
- `MODULOS.md`, este reporte, `docs/revision-visual-2026-10-13.md`,
  `docs/pruebas-ar-2026-10-13/` y `docs/capturas/ar-2026-10-13/`:
  documentación, salidas literales y evidencia visual.

Commits de código: `1f09eb0` (datos y concurrencia), `45a13fb` (módulos, seed y APIs),
`5d61efe` (corrección del recorte), `874b790` (vencimientos por confirmar y edición
de fechas). `PROMPT-MODULOS-AR.md` era un archivo local
del usuario y no se añadió a los commits.

## Preguntas para completar los datos

¿Dentu ya está en producción y sin saldo de cierre? ¿Qué estado, inicio y día
de cobro corresponden a Alwater? ¿Cuánto anticipo pagó Exi y cuándo vence su
balance? ¿Qué estado y mensualidad se confirman para SEMBID? ¿Cuándo fue la
baja de Futura Fortuna? ¿El Colegio eligió la propuesta completa o fase 1?
¿Qué importes definitivos van en los siete prospectos sin monto, qué fechas y
métodos corresponden a los pagos históricos y cómo se reparten los cobros extra?
