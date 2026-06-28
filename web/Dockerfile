FROM node:22-slim

# openssl es requerido por Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
# Multi-tenant + RLS: la app corre como `crm_app` (sin permisos DDL), así que NO se hace
# `prisma db push` en el arranque. Las migraciones de esquema se aplican manualmente con el
# rol dueño (ver MULTI-TENANT.md / web/prisma/sql/multi-tenant.sql) antes de desplegar.
CMD npm start
