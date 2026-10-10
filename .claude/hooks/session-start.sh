#!/bin/bash
# Cloud sessions start from a fresh clone: install packages and build the site,
# so `node scripts/shot.mjs` can shoot without waiting on either (see CLAUDE.md, 检查与截图).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
# A fresh build cuts the Chinese fonts and takes about a minute: do it in the
# background so the session is not held up. scripts/shot.mjs waits for the lock.
touch /tmp/n9-build.lock
nohup setsid bash -c 'npm run build > /tmp/n9-build.log 2>&1; rm -f /tmp/n9-build.lock' > /dev/null 2>&1 < /dev/null &
