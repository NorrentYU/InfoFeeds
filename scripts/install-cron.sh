#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/transnature--/Desktop/codes/InfoFeeds"
CRON_SCRIPT="$PROJECT_DIR/scripts/cron-report-once.sh"
CRON_MARKER="# InfoFeeds scheduled report daily 09:25 (UTC+8 expected)"
CRON_LINE="25 9 * * * $CRON_SCRIPT"

if [[ ! -x "$CRON_SCRIPT" ]]; then
  echo "[install-cron] missing executable: $CRON_SCRIPT"
  exit 1
fi

TMP_CRON="$(mktemp)"
trap 'rm -f "$TMP_CRON"' EXIT

# Preserve existing crontab (if any), then remove old InfoFeeds entries.
{
  crontab -l 2>/dev/null || true
} | awk -v marker="$CRON_MARKER" -v line="$CRON_LINE" '
  $0 == marker { next }
  $0 == line { next }
  { print }
' > "$TMP_CRON"

{
  echo "$CRON_MARKER"
  echo "$CRON_LINE"
} >> "$TMP_CRON"

# Keep only first occurrence for each line in case user crontab already has duplicates.
awk '!seen[$0]++' "$TMP_CRON" > "${TMP_CRON}.dedup"
mv "${TMP_CRON}.dedup" "$TMP_CRON"

crontab "$TMP_CRON"

echo "[install-cron] installed:"
crontab -l
