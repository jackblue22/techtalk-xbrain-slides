FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
COPY dashboard/package.json dashboard/package.json
COPY agent/package.json agent/package.json
RUN npm install
COPY dashboard dashboard
RUN npm run build -w @hanoi-lab/dashboard
FROM nginx:1.29-alpine
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dashboard/dist /usr/share/nginx/html
