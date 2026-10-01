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
ENV VITE_BACKEND_URL="" VITE_GIST_BACKEND_URL="" API_PROXY_TARGET="http://127.0.0.1:9"
RUN mkdir -p /etc/nginx/templates && echo 'server { listen 80; listen [::]:80; server_name _; root /usr/share/nginx/html; client_max_body_size 10m; location = /config.js { default_type application/javascript; add_header Cache-Control "no-store"; return 200 "window.__DRAWDB_CONFIG__ = { backendUrl: \"${VITE_BACKEND_URL}\", gistBackendUrl: \"${VITE_GIST_BACKEND_URL}\" };"; } location /api/ { proxy_pass ${API_PROXY_TARGET}/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto; proxy_read_timeout 120s; } location / { try_files $uri /index.html; } }' > /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
