# Verificar que la app NO salta RLS

RLS no protege a: superusuarios, roles con `BYPASSRLS` ni **dueños de la tabla** (salvo `FORCE ROW LEVEL SECURITY`).
Corre esto **conectado con el mismo usuario de `DATABASE_URL`** (`psql "$DATABASE_URL" -f …`), en cualquier entorno:

```sql
SELECT current_user                                   AS rol,
       r.rolsuper,
       r.rolbypassrls,
       -- ¿hereda de un rol que sí salta RLS?
       EXISTS (SELECT 1 FROM pg_roles x
                WHERE (x.rolsuper OR x.rolbypassrls)
                  AND pg_has_role(current_user, x.oid, 'USAGE'))  AS hereda_bypass,
       -- tablas de public que este rol posee y que no tienen FORCE RLS (el dueño las salta)
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND c.relowner = r.oid AND NOT c.relforcerowsecurity)  AS tablas_propias_sin_force,
       -- tablas con org_id que no tienen RLS activo
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped))
                                                              AS tablas_org_sin_rls
FROM pg_roles r WHERE r.rolname = current_user;
```

Resultado correcto: `rolsuper = f`, `rolbypassrls = f`, `hereda_bypass = f`, `tablas_propias_sin_force = 0`,
`tablas_org_sin_rls = 0`. Cualquier otro valor significa que el aislamiento entre empresas depende solo del código.

Comprobación práctica adicional (sin datos de nadie): con el mismo usuario y sin fijar empresa debe verse 0 filas.

```sql
SELECT count(*) AS filas_visibles_sin_empresa FROM contactos;   -- debe ser 0
```

Resultado en el contenedor de pruebas: `crm_app` → todo en `f`/`0`; `postgres` → `rolsuper = t`, `hereda_bypass = t`
y 69 tablas propias sin FORCE (por eso la app nunca debe usar ese usuario).
