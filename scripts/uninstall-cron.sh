#!/bin/zsh
set -euo pipefail

TMP_CRON="$(mktemp)"
trap 'rm -f "$TMP_CRON"' EXIT

{
  crontab -l 2>/dev/null || true
} | awk '
  /InfoFeeds scheduled report/ { next }
  /cron-report-once\.sh/ { next }
  { print }
' > "$TMP_CRON"

crontab "$TMP_CRON"

echo "[uninstall-cron] current crontab:"
crontab -l 2>/dev/null || true
