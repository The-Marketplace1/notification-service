#!/usr/bin/env bash
# scripts/send-event.sh — POST an event to the notification-service
#
# Useful for:
#   • Manual testing from the shell
#   • CI/CD smoke tests after deployment
#   • Integration from other repositories (auth-service, backend-api)
#     that cannot use the Node.js client directly
#
# Usage:
#   ./scripts/send-event.sh <event-name> [json-payload] [base-url]
#
# Arguments:
#   event-name    Required. One of the supported event types.
#   json-payload  Optional. Raw JSON string (default: "{}")
#   base-url      Optional. Service base URL (default: http://127.0.0.1:8082)
#
# Environment:
#   SERVICE_SECRET   — if set, added as X-Service-Secret header
#   NOTIF_BASE_URL   — alternative way to set the base URL
#
# Examples:
#   ./scripts/send-event.sh user.registered \
#     '{"userId":"u1","email":"alice@example.com","name":"Alice"}'
#
#   ./scripts/send-event.sh booking.created \
#     '{"bookingId":"b1","customerUserId":"u1","professionalUserId":"u2",
#       "customerName":"Alice","professionalName":"Bob",
#       "customerEmail":"alice@example.com","date":"2026-08-01","time":"10:00 AM"}'
#
#   ./scripts/send-event.sh password.reset.requested \
#     '{"userId":"u1","email":"alice@example.com","resetUrl":"https://app.com/reset/token123"}'
#
#   # Against a remote deployment:
#   NOTIF_BASE_URL=https://myapp.replit.app \
#   SERVICE_SECRET=my-secret \
#   ./scripts/send-event.sh user.registered '{"userId":"u1","email":"a@b.com"}'

set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
BLU='\033[0;34m'
RST='\033[0m'

# ── Argument parsing ──────────────────────────────────────────
if [[ $# -lt 1 ]]; then
    echo -e "${RED}Usage:${RST} $0 <event-name> [json-payload] [base-url]"
    echo ""
    echo "Supported events:"
    echo "  user.registered           user.email.verified"
    echo "  password.reset.requested  booking.created"
    echo "  booking.confirmed         booking.cancelled"
    echo "  review.created            professional.verified"
    echo "  transaction.completed"
    exit 1
fi

EVENT_NAME="$1"
PAYLOAD="${2:-{\}}"
BASE_URL="${3:-${NOTIF_BASE_URL:-http://127.0.0.1:8082}}"

EVENTS_URL="${BASE_URL%/}/notifications/events"

# ── Build curl headers ─────────────────────────────────────────
CURL_HEADERS=(-H "Content-Type: application/json")
if [[ -n "${SERVICE_SECRET:-}" ]]; then
    CURL_HEADERS+=(-H "X-Service-Secret: ${SERVICE_SECRET}")
fi

# ── Build request body ─────────────────────────────────────────
BODY=$(printf '{"event":"%s","payload":%s}' "$EVENT_NAME" "$PAYLOAD")

echo -e "${BLU}→${RST} POST $EVENTS_URL"
echo -e "${BLU}→${RST} Event: ${YLW}${EVENT_NAME}${RST}"

# ── Send request ───────────────────────────────────────────────
HTTP_CODE=$(curl -s -o /tmp/notif_send_response.json \
    -w "%{http_code}" \
    -X POST "$EVENTS_URL" \
    "${CURL_HEADERS[@]}" \
    -d "$BODY")

RESPONSE=$(cat /tmp/notif_send_response.json 2>/dev/null || echo '{}')
rm -f /tmp/notif_send_response.json

echo -e "${BLU}→${RST} HTTP $HTTP_CODE"
echo ""

# Pretty-print if jq is available
if command -v jq &>/dev/null; then
    echo "$RESPONSE" | jq .
else
    echo "$RESPONSE"
fi

echo ""

# ── Exit code based on HTTP response ──────────────────────────
if [[ "$HTTP_CODE" -eq 202 ]]; then
    echo -e "${GRN}✓ Event accepted (202)${RST}"
    exit 0
elif [[ "$HTTP_CODE" -eq 200 ]]; then
    echo -e "${YLW}! Event ignored — unknown event type (200)${RST}"
    exit 0
elif [[ "$HTTP_CODE" -eq 400 ]]; then
    echo -e "${RED}✗ Validation error — check payload fields (400)${RST}"
    exit 1
elif [[ "$HTTP_CODE" -eq 401 ]]; then
    echo -e "${RED}✗ Unauthorized — set SERVICE_SECRET env var (401)${RST}"
    exit 1
else
    echo -e "${RED}✗ Unexpected response (HTTP $HTTP_CODE)${RST}"
    exit 1
fi
