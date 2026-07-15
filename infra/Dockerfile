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
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG APP
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/prisma-generate-all.mjs
RUN pnpm exec nest build "${APP}"
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime
ARG APP
ENV APP=${APP}
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
USER node
CMD ["sh", "-c", "if [ -d prisma/${APP} ]; then npx prisma migrate deploy --schema prisma/${APP}/schema.prisma; fi && node dist/apps/${APP}/src/main.js"]
