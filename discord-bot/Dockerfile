FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build

COPY package.json package-lock.json ./
COPY discord-bot/package.json ./discord-bot/package.json
RUN npm ci

COPY discord-bot ./discord-bot
RUN npm run discord:build

FROM base AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY discord-bot/package.json ./discord-bot/package.json
RUN npm ci --omit=dev --workspace=@knowleague/discord-bot

COPY --from=build /app/discord-bot/dist ./discord-bot/dist
COPY data/catalogs/skin-items.json ./data/catalogs/skin-items.json

WORKDIR /app/discord-bot
USER node
CMD ["node", "dist/index.js"]
