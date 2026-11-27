#!/bin/sh

SITE_DIR=/usr/share/nginx/html

# The AutoWMS server the viewer starts with: ADAGUC_AUTOWMS_ENDPOINT, or -
# for setups configured before that name - ADAGUCSERVICES_AUTOWMS, or else
# the address in a local Adaguc-Server setup.
AUTOWMS_ENDPOINT="${ADAGUC_AUTOWMS_ENDPOINT:-${ADAGUCSERVICES_AUTOWMS:-http://localhost:8090/adaguc-services/autowms?}}"

echo "Writing config.json using ${AUTOWMS_ENDPOINT}"

echo "{\"autowmsurl\":\"${AUTOWMS_ENDPOINT}\"}" > "${SITE_DIR}/config.json"

# The path the viewer is served under, e.g. /workbench/ behind a reverse
# proxy - / by default. Given with or without its slashes.
BASE_PATH="${BASE_PATH:-/}"
case "${BASE_PATH}" in /*) ;; *) BASE_PATH="/${BASE_PATH}" ;; esac
case "${BASE_PATH}" in */) ;; *) BASE_PATH="${BASE_PATH}/" ;; esac

echo "Serving the viewer under ${BASE_PATH}"

# The site only refers to its own files relatively (./assets/...), so it
# works under any path as long as that ends in a slash - the path without
# one is redirected to it.
if [ "${BASE_PATH}" = "/" ]; then
  REDIRECT=""
else
  REDIRECT="location = ${BASE_PATH%/} { return 301 ${BASE_PATH}; }"
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name localhost;
    # Redirects to just the path, which the browser completes with the
    # host and port it used - not this container's own, which differ
    # behind a port mapping or reverse proxy.
    absolute_redirect off;

    # Compressed transfers: the viewer's JavaScript shrinks to under a third.
    # html is always included; fonts and images are already compressed.
    # Also behind a proxy, which nginx otherwise leaves uncompressed.
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/css text/javascript application/javascript application/json image/svg+xml text/xml application/xml;

    ${REDIRECT}

    location ${BASE_PATH} {
        alias ${SITE_DIR}/;
        index index.html;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root ${SITE_DIR};
    }
}
EOF

exec "$@"
