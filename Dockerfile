FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV SYNCBOARD_DB=/app/data/syncboard.db
COPY package.json ./
COPY server/package.json ./server/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
RUN mkdir -p /app/data
VOLUME /app/data
EXPOSE 4000
CMD ["node", "server/dist/server/src/index.js"]
