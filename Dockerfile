# ==============================================================================
# Divly Full-Stack Production Dockerfile (Node.js 22 + Built-in SQLite + Vite)
# Works out of the box on Railway, Render, Fly.io, Coolify, or a Proxmox VM!
# ==============================================================================
FROM node:22-bookworm-slim

WORKDIR /app

# Install curl for container healthchecks, then clean apt cache to stay slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1. Install dependencies first (cached unless package.json / package-lock.json change)
COPY package*.json ./
RUN npm ci

# 2. Copy full source and compile the React + Tailwind frontend into /app/dist
COPY . .
RUN npm run build

# 3. Create persistent SQLite data directory (mount a volume at /app/data in prod!)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/data/divly.sqlite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-3000}/api/state >/dev/null || exit 1

# Run the Express + SQLite server (serves both /api/* and compiled /app/dist SPA)
CMD ["npx", "tsx", "server/index.ts"]
