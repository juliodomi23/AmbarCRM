\set ON_ERROR_STOP on
\echo Esperado: crm_app | f | f | f | 0 | 0; filas_visibles_sin_empresa = 0
BEGIN TRANSACTION READ ONLY;
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

SELECT count(*) AS filas_visibles_sin_empresa FROM contactos;   -- debe ser 0
COMMIT;
