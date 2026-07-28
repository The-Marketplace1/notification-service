#!/usr/bin/env bash
# scripts/migrate.sh — Safe database schema migration for notification-service
#
# Wraps drizzle-kit push with:
#   • Pre-flight DATABASE_URL check
#   • Interactive confirmation in production
#   • Clear success/failure output
#   • Non-zero exit on failure (safe for CI pipelines)
#
# Usage:
#   ./scripts/migrate.sh              — interactive, confirms in production
#   ./scripts/migrate.sh --force      — skip confirmation prompt
#   ./scripts/migrate.sh --dry-run    — show what would change without applying
#   ./scripts/migrate.sh --generate   — generate SQL migration files instead of pushing
#
# Environment:
#   DATABASE_URL   Required. PostgreSQL connection string.
#   NODE_ENV       If "production", prompts for confirmation unless --force.
#
# CI usage (non-interactive):
#   NODE_ENV=production ./scripts/migrate.sh --force

set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
BLU='\033[0;34m'
RST='\033[0m'

FORCE=false
DRY_RUN=false
GENERATE=false

for arg in "$@"; do
    case "$arg" in
        --force)    FORCE=true ;;
        --dry-run)  DRY_RUN=true ;;
        --generate) GENERATE=true ;;
        *) echo -e "${RED}Unknown argument: $arg${RST}"; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${BLU}notification-service database migration${RST}"
echo "──────────────────────────────────────────"

# ── Check DATABASE_URL ─────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo -e "${RED}✗ DATABASE_URL is not set.${RST}"
    echo "  Export it or add it to your environment secrets."
    exit 1
fi

# Mask password in display
DB_DISPLAY=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
echo -e "  ${BLU}→${RST} Database: ${YLW}${DB_DISPLAY}${RST}"
echo -e "  ${BLU}→${RST} Environment: ${NODE_ENV:-development}"

if $GENERATE; then
    echo ""
    echo -e "${BLU}Generating SQL migration files …${RST}"
    cd "$SERVICE_DIR"
    pnpm run generate
    echo -e "${GRN}✓ Migration files generated in ./drizzle/${RST}"
    exit 0
fi

if $DRY_RUN; then
    echo ""
    echo -e "${YLW}Dry run — comparing local schema against live database …${RST}"
    cd "$SERVICE_DIR"
    if pnpm exec drizzle-kit check --config ./drizzle.config.ts 2>&1; then
        echo -e "${GRN}✓ Schema is in sync — no changes needed.${RST}"
    else
        echo -e "${YLW}! Schema drift detected. Run without --dry-run to apply changes.${RST}"
    fi
    echo ""
    echo -e "${YLW}! Dry run complete. No changes were applied.${RST}"
    exit 0
fi

# ── Production confirmation ────────────────────────────────────
if [[ "${NODE_ENV:-development}" == "production" ]] && ! $FORCE; then
    echo ""
    echo -e "${RED}⚠  You are about to migrate a PRODUCTION database.${RST}"
    echo -e "${YLW}   Existing data will NOT be deleted by drizzle push unless you${RST}"
    echo -e "${YLW}   remove columns manually — but schema mismatches may cause errors.${RST}"
    echo ""
    read -r -p "Type 'yes' to continue: " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        echo -e "${YLW}Migration cancelled.${RST}"
        exit 0
    fi
fi

# ── Apply migration ────────────────────────────────────────────
echo ""
echo -e "${BLU}Applying schema changes …${RST}"

cd "$SERVICE_DIR"

START_TIME=$(date +%s)
pnpm run push
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${GRN}✓ Schema migration complete (${ELAPSED}s)${RST}"
echo ""
echo "  Tables managed:"
echo "    • notifications"
echo "    • notification_templates"
echo "    • notification_logs"
echo ""
echo "  Run 'pnpm --filter @workspace/notification-service run push-force' to"
echo "  accept destructive changes (column drops, renames) without prompts."
