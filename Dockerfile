FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ENV DATABASE_URL="file:./build.db"
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/prod.db"
WORKDIR /app

RUN useradd -m -u 1001 nodeuser
RUN mkdir -p /data && chown -R nodeuser:nodeuser /data

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.* ./

USER nodeuser
EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node ./node_modules/next/dist/bin/next start -p ${PORT:-3000}"]
