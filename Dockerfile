# Single-box image: backend API + the built React dashboard (served at /).
# NOTE: live WhatsApp mode (PORTER_LIVE=1) needs whatsapp-web.js + Chromium libs — see docs/DEPLOY.md.
FROM node:24-slim
WORKDIR /app

# Backend deps first for layer caching. tsx/typescript are devDeps but needed to run, so keep dev deps.
COPY package*.json ./
RUN npm ci || npm install

# Build the dashboard into web/dist (the backend serves it at /).
COPY web/package*.json ./web/
RUN cd web && (npm ci || npm install)
COPY web ./web
RUN cd web && npm run build

# Backend source (runs via tsx — no build step).
COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

ENV PORT=3000
ENV PORTER_LIVE=0
EXPOSE 3000

# cockpit.sqlite is created on first boot; mount a volume at /app for persistence in production.
# Health check: GET /health. Set CAPTURE_TOKEN to lock down the ingest endpoints on a public host.
CMD ["npx", "tsx", "src/index.ts"]
