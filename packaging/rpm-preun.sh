# rpm %preun: on removal (not upgrade, where $1 is 1), stop running instances.
[ "$1" = 0 ] && pkill -x nexus 2>/dev/null
exit 0
