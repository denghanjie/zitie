#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/zitie.denghanjie.vip ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi
