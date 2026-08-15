# Build with: docker build --build-context root=. -f frontend/web/Dockerfile -t c17-web-phase2:local frontend/web
# The primary context stays limited to the Web app; the named root context supplies only the shared lockfile.
FROM node:24.13.0-alpine AS dependencies
WORKDIR /workspace
RUN corepack enable
COPY --from=root package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json frontend/web/package.json
RUN pnpm install --frozen-lockfile --filter @c17/web...

FROM node:24.13.0-alpine AS builder
WORKDIR /workspace
RUN corepack enable
ARG NEXT_PUBLIC_API_BASE_URL=http://api-gateway:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/frontend/web/node_modules ./frontend/web/node_modules
COPY --from=root package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . ./frontend/web
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm --filter @c17/web build

FROM node:24.13.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /workspace/frontend/web/.next/standalone ./
COPY --from=builder /workspace/frontend/web/.next/static ./frontend/web/.next/static
WORKDIR /app/frontend/web
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
