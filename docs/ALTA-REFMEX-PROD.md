# Alta de REFMEX en producción

> Checklist manual para dar de alta REFMEX en producción.
>
> **Preparado, no ejecutado.** No contiene contraseñas ni secretos. No ejecutar
> hasta tener backup verificado, migración aplicada, datos de negocio confirmados
> y autorización explícita para escribir en producción.

## 0. Datos que deben confirmarse antes de escribir

| Dato | Placeholder | Nota |
|---|---|---|
| Nombre de la organización | `__ORG_NOMBRE__` | Propuesta: `REFMEX`. |
| Slug de la organización | `__ORG_SLUG__` | El demo usa `refmex`; confirmar el slug real. |
| Administrador | `__ADMIN_NOMBRE__` / `__ADMIN_EMAIL__` | Cuenta con rol `admin`. |
| Responsables de cartera | `__RESPONSABLE_*_NOMBRE__` / `__RESPONSABLE_*_EMAIL__` | Darío, Juan José, Nelson, Víctor y Abner en el demo. |
| Apoyo administrativo | `__LUSMI_NOMBRE__` / `__LUSMI_EMAIL__` | Usuario que en el demo ve todas las actividades y confirma. |
| Cartera real | Lista de negocio | El demo tiene 42 clientes; no asumir que son los reales. |
| Notificaciones de auditoría | `__ID_NOTIFICACION_AUDITORIA__` | Usuario(s) que recibirán observaciones. |

No usar correos, nombres, contraseñas ni IDs del demo en producción. Los IDs de
usuario se obtienen de la tabla `usuarios` de la organización real.

## 1. Prerrequisitos

- [ ] Confirmar con Julio la ventana, el responsable de la ejecución y la
  autorización para escribir en producción.
- [ ] Hacer backup externo de la base y verificar su checksum.
- [ ] Confirmar que el deploy ejecutó `web/prisma/sql/actualizaciones.sql` con el
  servicio `db-migrate` y que terminó con código 0.
- [ ] No usar `prisma db push` contra producción.
- [ ] Conectarse como usuario dueño de la base. Si se usa `crm_app`, establecer
  `app.current_org` en la misma sesión antes de escribir.
- [ ] Confirmar que las tablas de Despacho, Auditoría y Notificaciones existen
  (ver sección 6).

## 2. Crear la organización

Sustituir los placeholders. Es idempotente: si el slug ya existe, reactiva la
organización y actualiza el nombre.

```sql
INSERT INTO orgs (nombre, slug, activo)
VALUES ('__ORG_NOMBRE__', '__ORG_SLUG__', true)
ON CONFLICT (slug) DO UPDATE
SET nombre = EXCLUDED.nombre,
    activo = true
RETURNING id, nombre, slug, activo;
```

Guardar el `id` devuelto como `__ORG_ID__`. No continuar si el slug ya existía
con datos que no correspondan a REFMEX.

## 3. Crear usuarios

Crear una contraseña distinta por usuario. No reutilizar contraseñas, no usar
`Demo2026!` y no guardar contraseñas en el repositorio ni en este documento.

Generar cada hash con el mismo costo que usa el alta de Serénica
(`bcrypt.hash(password, 12)`). Una forma local de generar el hash sin escribirlo
en el repositorio:

```powershell
Get-Content -Raw -LiteralPath "C:\ruta\segura\contrasena.txt" |
  node -e "const b=require('bcryptjs');const p=require('fs').readFileSync(0,'utf8').trim();if(!p)process.exit(1);console.log(b.hashSync(p,12))"
```

Sustituir `__HASH_*__` por el hash correspondiente. Los nombres, correos y
puestos son placeholders; ajustarlos a los datos reales confirmados.

```sql
INSERT INTO usuarios (org_id, nombre, email, password_hash, rol, puesto, activo)
VALUES
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__ADMIN_NOMBRE__', lower('__ADMIN_EMAIL__'), '__HASH_ADMIN__', 'admin', 'Director general', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__DARIO_NOMBRE__', lower('__DARIO_EMAIL__'), '__HASH_DARIO__', 'agente', 'Contador senior', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__JUAN_JOSE_NOMBRE__', lower('__JUAN_JOSE_EMAIL__'), '__HASH_JUAN_JOSE__', 'agente', 'Contador senior', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__NELSON_NOMBRE__', lower('__NELSON_EMAIL__'), '__HASH_NELSON__', 'agente', 'Contador senior', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__VICTOR_NOMBRE__', lower('__VICTOR_EMAIL__'), '__HASH_VICTOR__', 'agente', 'Gerente general', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__ABNER_NOMBRE__', lower('__ABNER_EMAIL__'), '__HASH_ABNER__', 'agente', 'Contador senior', true),
  ((SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'), '__LUSMI_NOMBRE__', lower('__LUSMI_EMAIL__'), '__HASH_LUSMI__', 'agente', 'Auxiliar administrativo', true)
ON CONFLICT (org_id, email) DO UPDATE
SET nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol,
    puesto = EXCLUDED.puesto,
    activo = true;
```

El `ON CONFLICT` no cambia la contraseña de una cuenta existente. Si hay que
restablecer una contraseña, hacerlo aparte y con autorización.

Obtener los IDs reales para configurar permisos:

```sql
SELECT id, nombre, email, rol, puesto
FROM usuarios
WHERE org_id = (SELECT id FROM orgs WHERE slug = '__ORG_SLUG__')
ORDER BY id;
```

Usar esos IDs en la sección 4. **No usar los IDs `82` ni `124` del demo.**

## 4. Configurar los módulos `despacho` y `auditoria`

Primero crear las filas de módulo si no existen. No cambiar su configuración
aquí:

```sql
INSERT INTO modulos_org (org_id, clave, activo, config)
SELECT o.id, m.clave, true, '{}'::jsonb
FROM orgs o
CROSS JOIN (VALUES ('despacho'), ('auditoria')) AS m(clave)
WHERE o.slug = '__ORG_SLUG__'
ON CONFLICT (org_id, clave) DO NOTHING;
```

Después ejecutar exactamente estos dos `UPDATE`.

### 4.1. Despacho

`puestosPermitidos` propuesto para la cartera del demo: administración,
gerencia y contadores senior. `usuariosAccesoTotal` y
`usuariosConfirmadores` son para personas que necesitan ver todo o confirmar
sin tener un puesto de gerencia; en el demo es el apoyo administrativo.
Ajustar a los puestos y personas reales.

```sql
UPDATE modulos_org
SET activo = true,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'puestosPermitidos', jsonb_build_array(
        'Administrador',
        'Director general',
        'Gerente general',
        'Contador senior'
      ),
      'usuariosAccesoTotal', jsonb_build_array('__ID_LUSMI__'),
      'usuariosConfirmadores', jsonb_build_array('__ID_LUSMI__')
    ),
    updated_at = now()
WHERE org_id = (SELECT id FROM orgs WHERE slug = '__ORG_SLUG__')
  AND clave = 'despacho';
```

Si no hace falta un permiso explícito, usar `'[]'::jsonb` en el arreglo
correspondiente. No dejar IDs de otra organización.

### 4.2. Auditoría

```sql
UPDATE modulos_org
SET activo = true,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'usuariosNotificadosObservacion', jsonb_build_array('__ID_NOTIFICACION_AUDITORIA__')
    ),
    updated_at = now()
WHERE org_id = (SELECT id FROM orgs WHERE slug = '__ORG_SLUG__')
  AND clave = 'auditoria';
```

`usuariosNotificadosObservacion` recibe avisos cuando una auditoría queda con
observaciones. Puede tener más de un ID; agregar tantos elementos como negocio
confirme.

## 5. Cartera de clientes

El demo contiene 42 clientes asignados (Darío 8, Juan José 12, Nelson 10,
Víctor 6, Abner 6) más el cliente interno `Despacho interno` con dos
actividades extraordinarias. **Esa cartera es la del demo, no un dato de negocio
confirmado.**

Antes de aplicar:

- [ ] Negocio confirma la lista real de clientes y el responsable de cada uno.
- [ ] Confirmar si los seis clientes ficticios del demo deben existir o no. En
  producción no deberían existir.
- [ ] Confirmar los correos reales de los cinco responsables.
- [ ] Ejecutar el dry-run y revisar que no haya responsables ambiguos ni
  coincidencias duplicadas.

Dry-run. No escribe datos:

```powershell
$env:ORG_SLUG = "__ORG_SLUG__"
$env:RESPONSABLE_DARIO_EMAIL = "__DARIO_EMAIL__"
$env:RESPONSABLE_JUAN_JOSE_EMAIL = "__JUAN_JOSE_EMAIL__"
$env:RESPONSABLE_NELSON_EMAIL = "__NELSON_EMAIL__"
$env:RESPONSABLE_VICTOR_EMAIL = "__VICTOR_EMAIL__"
$env:RESPONSABLE_ABNER_EMAIL = "__ABNER_EMAIL__"
npm run seed:refmex-despacho
```

Con la cartera del demo, el dry-run debe mostrar Darío 8, Juan José 12, Nelson
10, Víctor 6 y Abner 6, más la tarea interna. Si el negocio confirma otra
cartera, esos conteos cambiarán; no aplicar solo para “hacer coincidir” los
números.

Aplicar únicamente con autorización explícita, backup verificado y migración
aplicada:

```powershell
$env:ALLOW_PROD_DISPATCH_SEED = "1"
npm run seed:refmex-despacho -- --apply
```

No ejecutar `seed-demo-despacho.mjs` en producción. No ejecutar
`seed:refmex-despacho-mes` en producción: ese script tiene IDs de confirmadores
del demo hardcodeados y no debe usarse para datos reales.

## 6. Sanity checks

Ejecutar solo lecturas después del alta. No crear auditorías, clientes ni
actividades de prueba en producción.

```sql
-- Organización
SELECT id, nombre, slug, activo
FROM orgs
WHERE slug = '__ORG_SLUG__';

-- Usuarios y puestos
SELECT id, nombre, email, rol, puesto, activo
FROM usuarios
WHERE org_id = (SELECT id FROM orgs WHERE slug = '__ORG_SLUG__')
ORDER BY rol, nombre;

-- Módulos y configuración
SELECT clave, activo, jsonb_pretty(config)
FROM modulos_org
WHERE org_id = (SELECT id FROM orgs WHERE slug = '__ORG_SLUG__')
  AND clave IN ('despacho', 'auditoria')
ORDER BY clave;
```

Verificar que todos los IDs configurados pertenecen a la organización. El
resultado esperado es cero filas:

```sql
WITH org AS (
  SELECT id FROM orgs WHERE slug = '__ORG_SLUG__'
),
configurados AS (
  SELECT 'despacho.usuariosAccesoTotal' AS campo,
         jsonb_array_elements_text(config->'usuariosAccesoTotal')::bigint AS usuario_id
  FROM modulos_org, org
  WHERE modulos_org.org_id = org.id AND clave = 'despacho'
  UNION ALL
  SELECT 'despacho.usuariosConfirmadores',
         jsonb_array_elements_text(config->'usuariosConfirmadores')::bigint
  FROM modulos_org, org
  WHERE modulos_org.org_id = org.id AND clave = 'despacho'
  UNION ALL
  SELECT 'auditoria.usuariosNotificadosObservacion',
         jsonb_array_elements_text(config->'usuariosNotificadosObservacion')::bigint
  FROM modulos_org, org
  WHERE modulos_org.org_id = org.id AND clave = 'auditoria'
)
SELECT c.campo, c.usuario_id
FROM configurados c
LEFT JOIN usuarios u
  ON u.id = c.usuario_id
 AND u.org_id = (SELECT id FROM org)
WHERE u.id IS NULL;
```

Comprobar que la migración creó las estructuras necesarias:

```sql
SELECT
  to_regclass('public.notificaciones') AS notificaciones,
  to_regclass('public.auditoria_fiscal_clientes') AS auditoria_fiscal,
  to_regclass('public.auditoria_fiscal_procedimientos') AS auditoria_procedimientos,
  to_regclass('public.auditoria_fiscal_cambios') AS auditoria_cambios,
  to_regclass('public.despacho_movimientos_financieros') AS despacho_finanzas;
```

Validación funcional mínima, sin datos de prueba:

- [ ] Entrar como administrador y abrir `/despacho` y `/auditoria/fiscal`.
- [ ] Entrar con un contador senior y comprobar que ve el módulo Despacho.
- [ ] Entrar con el usuario de apoyo administrativo y comprobar que puede ver
  todas las actividades y confirmar.
- [ ] Confirmar que el usuario de `usuariosNotificadosObservacion` puede recibir
  notificaciones y que su ID pertenece a REFMEX.
- [ ] Revisar el aislamiento con `crm_app` siguiendo `docs/verificar-rls.md`.
- [ ] No ejecutar pruebas E2E ni seeds demo contra producción.

## 7. Pendiente de confirmar por el negocio

- [ ] **Cartera real:** confirmar si la cartera de ~40 clientes del demo es la
  cartera real de REFMEX, si faltan o sobran clientes y quién es el responsable
  de cada uno. Este punto es bloqueante para aplicar el seed de cartera.
- [ ] Confirmar el slug definitivo y el nombre legal/comercial de la
  organización.
- [ ] Confirmar nombres y correos reales del administrador, los cinco
  responsables y el apoyo administrativo.
- [ ] Confirmar los puestos reales que deben entrar a Despacho. Si negocio usa
  `Contador` en lugar de `Contador senior`, ajustar `puestosPermitidos`.
- [ ] Confirmar quién debe ver todas las actividades y quién debe confirmar; no
  asumir que son los IDs del demo.
- [ ] Confirmar quién recibe las notificaciones de observaciones de auditoría.
- [ ] Confirmar la ventana de alta y la autorización final para escribir en
  producción.