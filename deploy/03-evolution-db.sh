#!/bin/bash
set -e
# Base de datos para Evolution API: misma instancia de Postgres, base separada.
# Corre solo en el PRIMER arranque (volumen pgdata vacío), como el resto del init.
psql -U "$POSTGRES_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'evolution'" | grep -q 1 \
  || psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE evolution"
