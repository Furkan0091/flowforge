# ------------------------------------------------------------------
# FlowForge API / Worker
# The monorepo uses npm workspaces, so the base stage installs the
# whole workspace before copying application source.
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
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
EXPOSE 4000

# --- Build target ---
FROM base AS build
COPY . .
RUN npm run build -w @flowforge/api

# --- Production target ---
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
