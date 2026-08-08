# One image definition for all ten applications. Which one is built is chosen by the APP build
# argument, so a service cannot drift from the others in how it is packaged.
#
# Node 24 LTS is pinned here (V3 §4) regardless of the host's Node version.

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY backend/package.json backend/.npmrc backend/
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG APP
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd backend && pnpm exec prisma generate --schema prisma/authentication-identity-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/user-role-management-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/task-management-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/document-management-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/document-security-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/permission-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/audit-log-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/notification-service/schema.prisma && \
    pnpm exec prisma generate --schema prisma/security-monitoring-service/schema.prisma
RUN cd backend && pnpm exec nest build "${APP}"

FROM base AS runtime
ARG APP
ENV APP=${APP}
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/prisma ./prisma
USER root
RUN apk add --no-cache libreoffice poppler-utils imagemagick fontconfig ttf-dejavu
RUN cd /tmp && npm install prisma@6 && \
    for dir in /tmp/node_modules/*; do \
      name=$(basename "$dir"); \
      if [ "$name" != ".package-lock.json" ]; then \
        cp -rn "$dir" "/app/node_modules/$name" 2>/dev/null || true; \
      fi; \
    done && \
    rm -rf /tmp/node_modules && \
    chown -R node:node /app
USER node
CMD ["sh", "-c", "PRISMA=$(find node_modules/.pnpm -name 'index.js' -path '*/prisma/build/*' | head -1) && if [ -d prisma/${APP} ]; then node $PRISMA migrate deploy --schema prisma/${APP}/schema.prisma 2>&1 || true; fi && node dist/apps/${APP}/src/main.js"]
