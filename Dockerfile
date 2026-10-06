# syntax=docker/dockerfile:1

# ---- Etapa 1: instala só as dependências de produção -----------------------
FROM node:24-alpine AS deps

WORKDIR /app

# Dependências primeiro: essa camada só é refeita quando o package-lock muda.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- Etapa 2: imagem final -------------------------------------------------
FROM node:24-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data && chown node:node /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/database.sqlite

# A imagem oficial do Node já traz o usuário "node", sem privilégios de root.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "src/server.js"]
