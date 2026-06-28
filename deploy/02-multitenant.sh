#!/bin/bash
# Init de Postgres (corre UNA vez, con el volumen vacío, como el dueño/superusuario).
# Se ejecuta DESPUÉS de 01-schema.sql: aplica la migración multi-tenant (org_id + RLS),
# crea el rol `crm_app` y le pone la contraseña real de CRM_APP_PASSWORD.
set -euo pipefail

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /sql/multi-tenant.sql

# El SQL crea crm_app con una clave placeholder; aquí ponemos la real (escapando comillas).
ESCAPED="${CRM_APP_PASSWORD//\'/\'\'}"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE crm_app WITH PASSWORD '${ESCAPED}';"
