#!/bin/sh
set -eu

# Railway mounts its volume as root. Create only the reviewed Reader directory,
# then run the entire API as the existing unprivileged node account.
if [ "$(id -u)" = 0 ]; then
  if [ "${SECURE_READER_ENABLED:-false}" = true ]; then
    if [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != /app/api/.local ]; then
      echo 'Secure Reader volume mount path unavailable' >&2
      exit 1
    fi
    if [ ! -d /app/api/.local ] || [ -L /app/api/.local ]; then
      echo 'Secure Reader volume directory invalid' >&2
      exit 1
    fi
    install -d -m 0700 -o node -g node /app/api/.local/secure-reader-pdfs
  fi
  exec gosu node node dist/index.js
fi

if [ "$(id -u)" != "$(id -u node)" ]; then
  echo 'API runtime user invalid' >&2
  exit 1
fi
exec node dist/index.js
