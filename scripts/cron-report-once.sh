#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/transnature--/Desktop/codes/InfoFeeds"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/cron-report.log"

mkdir -p "$LOG_DIR"

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] [cron] scheduled report job start"
  cd "$PROJECT_DIR"
  /opt/homebrew/bin/npm run schedule:once
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] [cron] scheduled report job done"
} >> "$LOG_FILE" 2>&1
