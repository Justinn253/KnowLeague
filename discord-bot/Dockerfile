FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY discord-bot/package.json ./discord-bot/package.json
RUN npm ci

COPY discord-bot ./discord-bot
RUN npm run discord:build

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY discord-bot/package.json ./discord-bot/package.json
RUN npm ci --omit=dev --workspace=@knowleague/discord-bot

COPY --from=build /app/discord-bot/dist ./discord-bot/dist
COPY data/catalogs/skin-items.json ./data/catalogs/skin-items.json

WORKDIR /app/discord-bot
CMD ["node", "dist/index.js"]
