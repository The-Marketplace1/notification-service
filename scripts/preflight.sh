#!/usr/bin/env bash
# scripts/preflight.sh — Pre-start environment and connectivity checks
#
# Run this before starting the Node.js server to catch missing configuration
# early with clear error messages instead of cryptic runtime failures.
#
# Usage:
#   bash scripts/preflight.sh
#   ./scripts/preflight.sh          (after chmod +x)
#
# Called automatically by scripts/start.sh
#
# Exit codes:
#   0 — all checks passed; safe to start the service
#   1 — one or more checks failed; do not start the service

set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
BLU='\033[0;34m'
RST='\033[0m'

PASS="${GRN}✓${RST}"
FAIL="${RED}✗${RST}"
WARN="${YLW}!${RST}"

ERRORS=0

log_pass() { echo -e "  ${PASS} $1"; }
log_fail() { echo -e "  ${FAIL} ${RED}$1${RST}"; ERRORS=$((ERRORS + 1)); }
log_warn() { echo -e "  ${WARN} ${YLW}$1${RST}"; }
log_info() { echo -e "  ${BLU}→${RST} $1"; }

echo ""
echo -e "${BLU}notification-service preflight checks${RST}"
echo "──────────────────────────────────────"

# ────────────────────────────────────────────────────────────────
# 1. Required environment variables
# ────────────────────────────────────────────────────────────────
echo ""
echo "[ 1/4 ] Required environment variables"

check_env() {
    local var="$1"
    local desc="$2"
    if [[ -z "${!var:-}" ]]; then
        log_fail "$var is not set  (${desc})"
    else
        log_pass "$var is set"
    fi
}

check_env "DATABASE_URL"  "PostgreSQL connection string"
check_env "PORT"          "HTTP server port (set automatically by workflow)"

# Warn but don't fail for delivery credentials —
# the service starts fine without them; only delivery will be skipped.
warn_env() {
    local var="$1"
    local desc="$2"
    if [[ -z "${!var:-}" ]]; then
        log_warn "$var not set — ${desc} will be disabled"
    else
        log_pass "$var is set"
    fi
}

warn_env "REDIS_URL"             "queue workers will not process jobs"
warn_env "SMTP_HOST"             "email delivery disabled"
warn_env "SMTP_USER"             "email delivery disabled"
warn_env "SMTP_PASS"             "email delivery disabled"
warn_env "FROM_EMAIL"            "email will use fallback sender address"
warn_env "TWILIO_ACCOUNT_SID"    "SMS delivery disabled"
warn_env "TWILIO_AUTH_TOKEN"     "SMS delivery disabled"
warn_env "TWILIO_FROM_NUMBER"    "SMS delivery disabled"
warn_env "FIREBASE_SERVICE_ACCOUNT" "push notifications disabled"
warn_env "SERVICE_SECRET"        "events endpoint has no authentication"

# ────────────────────────────────────────────────────────────────
# 2. Database connectivity
# ────────────────────────────────────────────────────────────────
echo ""
echo "[ 2/4 ] Database connectivity"

if [[ -z "${DATABASE_URL:-}" ]]; then
    log_fail "Cannot check DB — DATABASE_URL is not set"
else
    # Extract host and port from DATABASE_URL
    DB_HOST=$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname)" 2>/dev/null || true)
    DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.port||5432)" 2>/dev/null || true)

    if [[ -n "${DB_HOST}" ]]; then
        log_info "Checking $DB_HOST:$DB_PORT …"
        # Try a TCP connection with a 5-second timeout
        if timeout 5 bash -c "echo > /dev/tcp/${DB_HOST}/${DB_PORT}" 2>/dev/null; then
            log_pass "Database port is reachable ($DB_HOST:$DB_PORT)"
        else
            log_fail "Cannot reach database at $DB_HOST:$DB_PORT (is PostgreSQL running?)"
        fi
    else
        log_warn "Could not parse DATABASE_URL to check connectivity"
    fi
fi

# ────────────────────────────────────────────────────────────────
# 3. Redis connectivity (optional — warn only)
# ────────────────────────────────────────────────────────────────
echo ""
echo "[ 3/4 ] Redis connectivity (optional)"

REDIS_PING_BIN="$(dirname "$0")/../tools/bin/redis-ping"

if [[ -z "${REDIS_URL:-}" ]]; then
    log_warn "REDIS_URL not set — skipping Redis check"
else
    if [[ -x "$REDIS_PING_BIN" ]]; then
        log_info "Using compiled redis-ping binary …"
        if "$REDIS_PING_BIN" 2>/dev/null; then
            log_pass "Redis is reachable"
        else
            log_warn "Redis is not reachable — queue workers will not process jobs until Redis is up"
        fi
    elif command -v redis-cli &>/dev/null; then
        log_info "Using redis-cli …"
        REDIS_HOST=$(node -e "const u=new URL(process.env.REDIS_URL);console.log(u.hostname)" 2>/dev/null || echo "127.0.0.1")
        REDIS_PORT=$(node -e "const u=new URL(process.env.REDIS_URL);console.log(u.port||6379)" 2>/dev/null || echo "6379")
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING 2>/dev/null | grep -q PONG; then
            log_pass "Redis is reachable"
        else
            log_warn "Redis is not reachable — queue workers will not process jobs until Redis is up"
        fi
    else
        log_warn "Neither redis-ping binary nor redis-cli found — skipping Redis connectivity test"
        log_warn "Run 'make' in the service directory to build the redis-ping tool"
    fi
fi

# ────────────────────────────────────────────────────────────────
# 4. Port availability
# ────────────────────────────────────────────────────────────────
echo ""
echo "[ 4/4 ] Port availability"

PORT="${PORT:-8082}"
if command -v ss &>/dev/null; then
    if ss -tlnp "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"; then
        log_fail "Port $PORT is already in use — another process may be running"
    else
        log_pass "Port $PORT is available"
    fi
elif command -v lsof &>/dev/null; then
    if lsof -iTCP:"$PORT" -sTCP:LISTEN &>/dev/null; then
        log_fail "Port $PORT is already in use"
    else
        log_pass "Port $PORT is available"
    fi
else
    log_warn "Cannot check port availability (ss/lsof not found)"
fi

# ────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
if [[ "$ERRORS" -eq 0 ]]; then
    echo -e "${GRN}All checks passed. Starting notification-service …${RST}"
    echo ""
    exit 0
else
    echo -e "${RED}${ERRORS} check(s) failed. Fix the errors above before starting.${RST}"
    echo ""
    exit 1
fi
