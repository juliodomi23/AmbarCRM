FROM node:22-slim

# openssl es requerido por Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_CONFIG_ID
ARG NEXT_PUBLIC_META_GRAPH_VERSION=v26.0
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_CONFIG_ID=$NEXT_PUBLIC_META_CONFIG_ID
ENV NEXT_PUBLIC_META_GRAPH_VERSION=$NEXT_PUBLIC_META_GRAPH_VERSION

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
# Multi-tenant + RLS: la app corre como `crm_app` (sin permisos DDL), así que NO se hace
# `prisma db push` en el arranque. En BD limpia, el esquema + la migración multi-tenant los
# aplica Postgres en su init (docker-compose: schema.sql + deploy/02-multitenant.sh).
CMD npm start
