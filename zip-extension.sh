#!/bin/bash
set -e

# Thư mục chứa script (clone có thể tên fptu-schedule hoặc khác)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

zip -r fptu-schedule.zip manifest.json background.js popup.html popup.js popup.css content.js lib/schedule.js lib/ics.js study-sources.json study-suggestions.js icon-16.png icon-48.png icon-128.png -x "*.DS_Store" "*.git*"
