# Módulos personalizables

Un módulo se registra en `web/src/lib/modulos.ts` con una clave estable, nombre, descripción, icono SVG y ruta. La plataforma lo activa por organización en Configuración → Clientes; cada organización solo puede editar la configuración JSON de los módulos activos.

Para agregar un módulo nuevo: añade su catálogo, crea sus tablas con `org_id`, DEFAULT de `app.current_org`, RLS `org_isolation` y GRANT en `web/prisma/sql/actualizaciones.sql`, refléjalo en Prisma, protege todas sus APIs con `requireModuloActivo("clave")` y añade su página. AppShell y Ctrl+K consumen el catálogo activo automáticamente.
