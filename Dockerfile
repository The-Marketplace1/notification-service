# ============================================================
# Dockerfile — notification-service
# Multi-stage build: compile C tools + build Node.js dist,
# then copy only the runtime artefacts into a lean final image.
# ============================================================

# ── Stage 1: C tool builder ────────────────────────────────
FROM gcc:14-bookworm AS c-builder

WORKDIR /build

COPY tools/ ./tools/
COPY Makefile ./

RUN make CC=gcc


# ── Stage 2: Node.js builder ───────────────────────────────
FROM node:24-bookworm-slim AS node-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy workspace manifests first for layer-cached dependency install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

# Copy lib packages (needed for typecheck + build)
COPY lib/ ./lib/

# Copy only the notification-service package manifest
COPY package.json ./package.json

# Install all workspace dependencies (frozen for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy notification-service source
COPY . ./

# Build the Node.js bundle
RUN pnpm run build


# ── Stage 3: Production runtime ────────────────────────────
FROM node:24-bookworm-slim AS runtime

# Install only OS-level runtime deps:
#   dumb-init — PID 1 signal forwarding + zombie reaping
#   ca-certificates — HTTPS (SMTP, Twilio, Firebase)
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends \
       dumb-init \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd --gid 1001 notif \
    && useradd --uid 1001 --gid notif --shell /bin/sh --create-home notif

WORKDIR /app

# Copy compiled C tools
COPY --from=c-builder /build/tools/bin/ ./tools/bin/

# Copy Node.js dist bundle
COPY --from=node-builder /workspace/dist/ ./dist/

# Copy node_modules that esbuild externalised
COPY --from=node-builder /workspace/node_modules/ ./node_modules/

# Copy scripts
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

# Ownership
RUN chown -R notif:notif /app

USER notif

EXPOSE 8082

# Health check using our compiled C tool
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["./tools/bin/healthcheck"]

# dumb-init ensures SIGTERM is forwarded to Node.js for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
