# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build Next.js with standalone output.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 2: Runtime
FROM node:22-alpine AS runner

RUN adduser -D -H -h /app appuser

WORKDIR /app

# Copy standalone output.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy config defaults for build-time CSS vars fallback.
COPY --from=builder /app/src/config ./src/config

USER appuser

EXPOSE 3000

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

CMD ["node", "server.js"]
