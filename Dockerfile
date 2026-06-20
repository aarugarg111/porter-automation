# Backend (API engine) image. Runs the cockpit on :3000 in fake/no-live mode by default.
# NOTE: live WhatsApp mode (PORTER_LIVE=1) needs whatsapp-web.js + Chromium libs — see docs/DEPLOY.md.
FROM node:24-slim
WORKDIR /app

# Install deps first for layer caching. tsx/typescript are devDeps but are needed to run, so keep dev deps.
COPY package*.json ./
RUN npm ci || npm install

# App source (no build step — the app runs via tsx).
COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

ENV PORT=3000
ENV PORTER_LIVE=0
EXPOSE 3000

# cockpit.sqlite is created on first boot; mount a volume at /app for persistence in production.
CMD ["npx", "tsx", "src/index.ts"]
