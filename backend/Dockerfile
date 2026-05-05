# ──────────────────────────────────────────────────────────────────────────────
# Backend container — Node 20 + Chromium for whatsapp-web.js (Puppeteer)
#
# whatsapp-web.js drives WhatsApp Web through a headless Chromium that
# Puppeteer normally downloads at npm-install time. Railway's default Nixpacks
# build doesn't include Chromium, which is why the import was failing with
# "Failed to launch the browser process" → /api/whatsapp/* routes returning
# 503 "WhatsApp integration not available on this server".
#
# This Dockerfile:
#   1. Installs Chromium and the shared libraries it depends on (Debian).
#   2. Tells Puppeteer to skip its own Chrome download and use the system one.
#   3. Sets PUPPETEER_EXECUTABLE_PATH so client.js can pass it to the
#      whatsapp-web.js Client config.
#
# Railway volume note (manual, in dashboard):
#   For the WhatsApp session to survive deploys, mount a Railway volume at
#   /app/.wa-session. Without it, the QR re-scan happens every redeploy.
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim

# Chromium + libs Puppeteer needs at runtime. Versions are pinned by the base
# image; bookworm-slim's Chromium is regularly maintained.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc-s1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's Chrome download during npm install (saves ~150 MB and
# avoids needing to re-download what we already have via apt).
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Copy lockfile-equivalents first so layer cache is reused when only source
# code changes.
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Source
COPY . .

# Persist whatsapp-web.js LocalAuth session across deploys when a Railway
# volume is mounted here. Without the volume the dir is in the ephemeral
# layer and the shopkeeper has to scan QR after every deploy.
RUN mkdir -p /app/.wa-session
VOLUME ["/app/.wa-session"]

# Railway sets PORT at runtime; index.js reads it. We don't EXPOSE a fixed
# port for that reason — Railway handles the routing.

CMD ["node", "src/index.js"]
