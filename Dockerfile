FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4050
ENV DATABASE_PATH=/data/budget.db
ENV SECURE_COOKIES=false
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /data && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 4050

CMD ["node", "server.js"]
