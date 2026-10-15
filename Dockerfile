# Builds the React app and serves it from the Express API on port 4000.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY api/ ./
COPY --from=web /app/web/dist /app/web/dist
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
