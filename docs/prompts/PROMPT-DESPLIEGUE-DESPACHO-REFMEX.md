# Prompt de continuidad — Despacho REFMEX a producción

> Copia desde `## Prompt` y pégalo en Claude al retomar. No contiene contraseñas ni secretos.

## Prompt

Trabajas en AmbarCRM, raíz `docs/08-productos-internos/AmbarCRM`, aplicación en `web/` (Next.js 16, Prisma 5, PostgreSQL con RLS). Julio quiere cerrar la implementación de Despacho/REFMEX y llevarla a producción cuando estén satisfechos los controles y aprobaciones. **No despliegues ni escribas en la BD de producción hasta completar los bloqueos y confirmar con Julio los datos/ventana que falten.** Responde en español.

### Estado local actual

- Rama observada: `meta-tech-provider`, en `38d7c3a` (merge de `modulos-despacho-contenido`) con `7299547` de Auditoría detrás. Hay cambios sin commit de esta tarea y de la corrección previa al script de tema del root layout. No hagas reset, checkout destructivo, rebase ni push directo.
- Hay archivos ajenos sin seguimiento que deben conservarse y no entrar al commit: `docs/PLAN-MIGRACION-SERENICA.md` y `docs/VARIABLES-CORREO-CRMLITE.md`.
- La demo local está activa en `http://localhost:3000/login?org=refmex`; PostgreSQL local usa el contenedor `ambarcrm-dev-db` en `127.0.0.1:5433`.
- Las credenciales locales del Administrador y Lusmi se probaron por HTTP en la sesión anterior; se omitieron de este archivo intencionalmente. Si hacen falta para una revisión visual, pídeselas a Julio; no las resetees ni las pegues en el repositorio o logs.
- Ya se aplicó `web/prisma/sql/actualizaciones.sql` a la BD local, se generó Prisma Client, y se cargó la cartera de este prompt en REFMEX local. El seed se repitió: no duplicó clientes ni tareas.
- La cartera local contiene 42 clientes asignados (Darío 8, Juan José 12, Nelson 10, Víctor 6, Abner 6) y el cliente interno `Despacho interno` con dos actividades extraordinarias: “Factura de honorarios del despacho” para Nelson y “Supervisar seguimiento de actividades” para Víctor. Los seis clientes ficticios anteriores de la demo permanecen; el seed es aditivo.
- En el seed demo, Lusmi corresponde a `lusmi@refmex.demo`; tiene permisos del módulo para ver todas las actividades y confirmarlas, sin rol global de Administradora.
- La contraseña local de Lusmi se restableció para esta demo y su autenticación fue verificada; la clave no se guardó en el repositorio.
- La escala de calidad de los trabajadores aún no la entrega el cliente. La pantalla deja constancia de ese pendiente; no inventes una escala.

### Funcionalidad ya implementada

- `/despacho`: el porcentaje global enlaza al desglose de Rendimiento; las tarjetas de cliente abren su ficha/Kanban.
- `/despacho/rendimiento`: avance confirmado por responsable y cliente, selector mensual y gráfica simple de los seis meses recientes. Las actividades completadas que requieren confirmación no cuentan hasta su aprobación.
- En el Kanban hay una columna **Por confirmar** y acción de confirmación. Gerencia/administración y usuarios explícitamente autorizados pueden confirmar. Las actividades históricas anteriores a la regla conservan su avance; las nuevas requieren confirmación.
- La Administradora global gestiona accesos específicos del módulo en `/despacho/configuracion`; esos permisos no elevan el rol global del usuario.
- `/despacho/clientes/[id]` muestra también el Kanban del cliente y del mes seleccionado. Las actividades extraordinarias se conservan como tipo de actividad.
- `/despacho/finanzas` separa las unidades Despacho y REFMEX; registra ingresos, costos y gastos con fecha y responsable, admite cliente/vencimiento para ingresos, pagos parciales y cartera pendiente por cobrar.
- Migración aditiva/RLS para columnas de confirmación y tablas financieras está en `web/prisma/sql/actualizaciones.sql`; modelos en `web/prisma/schema.prisma`.
- Seed de la cartera de REFMEX: `web/scripts/seed-refmex-despacho-cartera.mjs`. Dry-run por defecto, no borra filas, reutiliza contactos por nombre normalizado, crea clientes faltantes, asigna responsable principal, ajusta procesos/actividades ya existentes y registra la reasignación en el historial. Las dos actividades internas se agrupan en “Despacho interno”.

### Inventario exacto de cambios ya hechos

- Datos y RLS: `web/prisma/schema.prisma`, `web/prisma/sql/actualizaciones.sql`; se añadieron confirmación de actividades y las tablas `despacho_movimientos_financieros`/`despacho_finanza_pagos`, con FK compuestas, índices, RLS y grants.
- Reglas/permisos: `web/src/lib/despacho.ts`, `web/src/lib/modulos-catalogo.ts`, `web/src/lib/modulos.ts`, `web/src/app/api/modulos/route.ts`, `web/src/lib/demo/api/marco.ts`.
- APIs Despacho: `web/src/app/api/despacho/actividades/route.ts`, `web/src/app/api/despacho/actividades/[id]/route.ts`, `web/src/app/api/despacho/actividades/[id]/confirmar/route.ts`, `web/src/app/api/despacho/clientes/route.ts`, `web/src/app/api/despacho/clientes/[id]/route.ts`, `web/src/app/api/despacho/permisos/route.ts`, `web/src/app/api/despacho/finanzas/route.ts`, `web/src/app/api/despacho/finanzas/[id]/pagos/route.ts`.
- Páginas: `web/src/app/(app)/despacho/page.tsx`, `rendimiento/page.tsx`, `tablero/page.tsx`, `clientes/page.tsx`, `clientes/[id]/page.tsx`, `mi-trabajo/page.tsx`, `configuracion/page.tsx` y `finanzas/page.tsx`.
- Componentes: `web/src/components/despacho/DespachoActividades.tsx`, `DespachoClienteDetalle.tsx`, `DespachoClientes.tsx`, `DespachoConfiguracion.tsx`, `DespachoNavegacion.tsx`, `DespachoFinanzas.tsx`.
- Seeds y documentación: `web/scripts/seed-refmex-despacho-cartera.mjs`, `web/scripts/seed-demo-despacho.mjs`, `web/scripts/seed-demo-auditoria.mjs`, `web/package.json`, `MODULOS.md`.
- Pruebas: `web/scripts/check-despacho.ts`, `web/prisma/scripts/test-despacho-e2e.ts`, `web/prisma/scripts/test-aislamiento.ts`, `web/prisma/scripts/test-auditoria-e2e.ts`, `web/prisma/scripts/e2e-http.ts`.
- El helper E2E compartido cambió: `web/prisma/scripts/e2e-http.ts` ahora exporta `paginaE2EConCuerpo` (estado + cuerpo) y documenta que en Next.js 16 una redirección del servidor durante el streaming responde 200 con marcador `NEXT_REDIRECT` en el cuerpo, no 307. `test-auditoria-e2e.ts` usa ese helper en vez de repetir el `fetch`.
- También está sin commit `web/src/app/layout.tsx`, corrección previa del `<script>` del tema: ahora usa `next/script`. No la descartes al preparar la rama.
- El módulo `auditoria` ya estaba commiteado en `7299547`; lo de esta sesión es solo el ajuste del E2E de auditoría y el seed que le asigna a Lusmi los permisos del módulo.
- Nada de esto está commiteado todavía: son 32 archivos modificados y 8 rutas nuevas sin seguimiento (las de `finanzas/`, `rendimiento/`, `confirmar/`, `finanzas/`, `permisos/` y `DespachoFinanzas.tsx`), más este prompt y `web/scripts/seed-refmex-despacho-cartera.mjs`.

### Objetivo de esta continuación

1. Revisar cambios y cerrar cualquier fallo real de integración; no reimplementar lo que ya está listo.
2. Hacer la regresión en BD desechable, practicar la migración idempotente sobre una copia restaurada y preparar el paquete de release.
3. Confirmar con Julio lo necesario para producción: slug real de la organización, correos reales de los cinco responsables, aprobación/ventana aplicable, URL HTTPS, servicio/host EasyPanel y nombres de contenedores según el panel.
4. Hacer backup externo verificado, merge/push mediante el proceso autorizado y deploy EasyPanel únicamente tras superar los controles.
5. Ejecutar el seed de cartera en producción solo después de mostrarle a Julio el dry-run del slug/emails correctos y recibir confirmación explícita para aplicar.
6. Verificar migración y humo post-deploy; entregar SHA desplegado, conteos y resultados reales.

### Reglas obligatorias

- Lee antes de actuar: `README.md`, `DESPLIEGUE.md`, `docs/CHECKLIST-MERGE-META.md`, `PLAN-CIERRE-FASE-2.md`, `MULTI-TENANT.md` y la sección de Despacho/seed en `MODULOS.md`. Revisa si el checklist de Meta sigue siendo gate aplicable a este release; no des por aprobada Meta ni una ventana de mantenimiento.
- Vuelve a correr `git status --short`, `git branch --show-current`, `git log --oneline -10` y revisa `git diff` antes de elegir cómo preparar el release. Conserva todo trabajo del usuario. Sigue `README.md`: rama de tarea/PR contra `meta-tech-provider`; no hagas push directo ni incluyas los dos documentos ajenos sin seguimiento.
- No uses `prisma db push` contra producción. Ensaya el SQL de `actualizaciones.sql` **dos veces** en una BD desechable restaurada desde una copia reciente de producción y verifica filas/checks/fechas/RLS. Producción migra mediante el servicio `db-migrate` del Compose; confirma su código de salida y logs.
- No ejecutes pruebas/E2E, seeds demo ni peticiones de prueba contra producción. No leas ni muestres secretos. Las únicas escrituras de producción permitidas son la migración del release y el seed específico de cartera, después de los gates y confirmaciones descritos aquí.
- El `test-aislamiento.ts` previamente falló por checks ajenos de `dispositivos_push_plataforma_check` y `odontograma_zonas_diente_check`. Reejecútalo en el entorno desechable actualizado: si son los mismos fallos, documenta su carácter previo y no cambies tablas ajenas a este feature; detente si aparecen fallos nuevos en las tablas Despacho/Finanzas.
- No corras `seed-demo-despacho.mjs` en producción: es un seed de demo distinto y reconstruye datos demo. Para la cartera usa exclusivamente `seed-refmex-despacho-cartera.mjs`.
- La calidad de trabajadores está pendiente de que el cliente envíe su escala. No inventes puntuaciones ni presentes esa gráfica como terminada; se puede desplegar lo demás dejando este pendiente declarado.

### Pruebas requeridas

Desde `web/`, ejecutar y registrar resultado verdadero:

```powershell
npm run lint
npm run build
npx tsx scripts/check-despacho.ts
```

Para `check-despacho.ts`, repetir con `CHECK_DB=1` y `DATABASE_URL` de una BD local/desechable. Para los E2E, crear/usar una BD desechable local (`:55433` o `:55451`), aplicarle `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql`; iniciar Next en `:3120` con `DATABASE_URL` de `crm_app` apuntando a esa misma BD. `ADMIN_DATABASE_URL` usa el rol dueño de esa BD. El `.env` local puede tener una URL de BD vieja: pasar las URLs de test por variables de entorno y nunca imprimirlas. Detén `next dev` antes de `npm run build` para evitar el bloqueo del query engine Prisma, y reinícialo después si hace falta.

```powershell
$env:E2E_BASE_URL='http://localhost:3120'
$env:ADMIN_DATABASE_URL='<URL local de rol dueño, sin imprimirla>'
npm run test:despacho:e2e
npm run test:auditoria:e2e
```

El E2E de Despacho comprueba permisos normales/Lusmi, confirmación, idempotencia de generación, Kanban/pages, ingresos, pagos parciales, cartera y aislamiento tenant. Los E2E deben correr únicamente sobre una BD local desechable con `actualizaciones.sql` aplicado.

### Seed: previsualización y aplicación

Local, el dry-run no escribe nada:

```powershell
npm run seed:refmex-despacho
```

La carga local ya se aplicó y se repitió con cero duplicados. Para producción, después de identificar la organización y los correos reales de los responsables, primero ejecuta dry-run con `ORG_SLUG` y:

- `RESPONSABLE_DARIO_EMAIL`
- `RESPONSABLE_JUAN_JOSE_EMAIL`
- `RESPONSABLE_NELSON_EMAIL`
- `RESPONSABLE_VICTOR_EMAIL`
- `RESPONSABLE_ABNER_EMAIL`

Comprueba que el dry-run da Darío 8, Juan José 12, Nelson 10 clientes + la tarea interna, Víctor 6 clientes + la tarea interna y Abner 6; no debe mostrar responsables ambiguos ni coincidencias duplicadas. La lista de Abner ya quedó interpretada como Bertha Tinoco, Jesica Quiroz y Ralda Elizabeth. Solo con confirmación explícita de Julio, backup verificado, migración aplicada y organización/emails correctos, ejecutar `--apply` con `ALLOW_PROD_DISPATCH_SEED=1`. Registra conteos antes/después. Si una coincidencia de contactos resulta ambigua, detente y solicita resolución; no fusiones contactos por parecido.

### Gate de release y entrega

- Antes de push/deploy, seguir literalmente `docs/CHECKLIST-MERGE-META.md` en su orden y actualizarlo para el alcance de Despacho si hace falta. Ese checklist exige autorización y datos de ventana (HTTPS CRM, host, servicio, contenedores backup/app/db-migrate), backup descargado y checksum igual, merge fast-forward, push autorizado, redeploy EasyPanel, `db-migrate` exit code 0 y humo. No inventes comando EasyPanel/SSH si falta el dato: pregúntale a Julio.
- Si falta cualquiera de aprobación requerida, URL/slug/email, credenciales de panel/SSH, copia ensayada, backup o autorización de la carga productiva, detente antes de mutar producción; completa lo seguro y deja explícito el bloqueo.
- En el cierre indica SHA de la rama y del despliegue, archivos/cambios principales, pruebas con estado, conteo/resultado del seed (sin datos personales innecesarios), estado del smoke test, rollback/back-up y el pendiente de escala de calidad.
- No se ha hecho ningún deploy ni escritura en la BD de producción todavía.
