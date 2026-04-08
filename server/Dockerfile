# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

# Runtime dependency for better-sqlite3
RUN apk add --no-cache libstdc++

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY public/ ./public/

RUN mkdir -p data public/uploads

VOLUME ["/app/data", "/app/public/uploads"]
EXPOSE 3000

CMD ["node", "dist/index.js"]
