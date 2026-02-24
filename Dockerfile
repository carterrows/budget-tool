FROM node:24.13.0-alpine AS base
RUN npm install -g npm@11.10.0

FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.13.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4050
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/budget.db
ENV ALLOW_SIGNUP=false
ENV SECURE_COOKIES=true
ENV API_RATE_LIMIT_WINDOW_MS=60000
ENV API_RATE_LIMIT_GENERAL_MAX=120
ENV API_RATE_LIMIT_AUTH_MAX=15
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /data && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 4050

CMD ["node", "server.js"]
