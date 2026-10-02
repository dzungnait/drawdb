# Stage 1: Build the app
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Stage 2: Setup the Nginx Server to serve the app
FROM docker.io/library/nginx:stable-alpine3.23 AS production
COPY --from=build /app/dist /usr/share/nginx/html
# API_PROXY_TARGET: optional URL of drawdb-server (e.g. its private Railway
# address). Requests to /api/* are forwarded there, so the app and the API
# share one origin and session cookies stay first-party. Then set
# VITE_BACKEND_URL=/api.
# Its address is looked up again every few seconds (with the resolvers from
# /etc/resolv.conf), so a redeployed API with a new private IP is still
# reached without restarting this container.
ENV VITE_BACKEND_URL="" VITE_GIST_BACKEND_URL="" API_PROXY_TARGET="http://127.0.0.1:9" NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
RUN mkdir -p /etc/nginx/templates && echo 'server { listen 80; listen [::]:80; server_name _; root /usr/share/nginx/html; resolver ${NGINX_LOCAL_RESOLVERS} valid=10s; client_max_body_size 10m; location = /config.js { default_type application/javascript; add_header Cache-Control "no-store"; return 200 "window.__DRAWDB_CONFIG__ = { backendUrl: \"${VITE_BACKEND_URL}\", gistBackendUrl: \"${VITE_GIST_BACKEND_URL}\" };"; } location /api/ { set $api_upstream ${API_PROXY_TARGET}; rewrite ^/api/(.*)$ /$1 break; proxy_pass $api_upstream; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto; proxy_read_timeout 120s; } location / { try_files $uri /index.html; } }' > /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
