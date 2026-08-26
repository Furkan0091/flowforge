# ------------------------------------------------------------------
# FlowForge Web (React + Vite)
# ------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# --- Development target (used by docker compose) ---
FROM base AS dev
COPY apps/web apps/web
EXPOSE 5173

# --- Build target ---
FROM base AS build
COPY . .
RUN npm run build -w @flowforge/web

# --- Production target ---
FROM nginx:alpine AS prod
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
