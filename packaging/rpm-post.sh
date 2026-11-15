# rpm %post: (re)start NEXUS hidden in every open session, so its shortcut works right away,
# without logging out. On its first start NEXUS creates the GNOME shortcut itself.
# Later logins start it through /etc/xdg/autostart/nexus.desktop.
pkill -x nexus 2>/dev/null && sleep 1 # upgrade: the old process would swallow the new one (single instance)
for dir in /run/user/*; do
  uid=${dir##*/}
  [ "$uid" -ge 1000 ] 2>/dev/null && [ -S "$dir/bus" ] || continue
  user=$(id -nu "$uid" 2>/dev/null) || continue
  runuser -u "$user" -- env XDG_RUNTIME_DIR="$dir" DBUS_SESSION_BUS_ADDRESS="unix:path=$dir/bus" \
    systemd-run --user --quiet --collect /usr/bin/nexus >/dev/null 2>&1 || true
done
exit 0
