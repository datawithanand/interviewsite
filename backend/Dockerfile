FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Uses `prisma db push` rather than `migrate deploy`: this project ships
# schema.prisma as the single source of truth without a migration history.
# For larger teams/production hardening, switch to `prisma migrate` and
# commit generated migration files instead.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/index.js"]
