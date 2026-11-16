# One image: Fastify serves the API, the presence socket and the built front end. SQLite lives on the /data volume.
FROM node:26-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production DB_FILE=/data/one-light.db PORT=8787
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server server
COPY --from=build /app/shared shared
COPY --from=build /app/web/dist web/dist
VOLUME /data
EXPOSE 8787
CMD ["node", "server/main.ts"]
