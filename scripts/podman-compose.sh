#!/bin/sh
set -eu

if ! command -v podman >/dev/null 2>&1; then
  echo "podman tidak ditemukan di PATH." >&2
  exit 127
fi

# Desktop session tertentu mengekspor alamat D-Bus privat di /tmp atau
# unix:abstract. crun lalu mengirim permintaan cgroup ke bus systemd yang salah.
case "${DBUS_SESSION_BUS_ADDRESS:-}" in
  unix:path=/run/user/*/bus|"") ;;
  *)
    echo "Mengabaikan DBUS_SESSION_BUS_ADDRESS non-standar untuk Podman rootless." >&2
    unset DBUS_SESSION_BUS_ADDRESS
    ;;
esac

if [ "$#" -eq 0 ]; then
  set -- up --build
fi

exec podman compose "$@"
