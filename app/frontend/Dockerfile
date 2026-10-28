FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
COPY dashboard/package.json dashboard/package.json
COPY agent/package.json agent/package.json
RUN npm install
COPY app/frontend app/frontend
RUN npm run build -w @hanoi-lab/frontend
FROM nginx:1.29-alpine
COPY app/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/app/frontend/dist /usr/share/nginx/html
