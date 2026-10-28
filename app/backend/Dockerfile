FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
COPY dashboard/package.json dashboard/package.json
COPY agent/package.json agent/package.json
RUN npm install
COPY app/backend app/backend
RUN npm run build -w @hanoi-lab/backend

FROM node:24-alpine
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/app/backend/package.json ./app/backend/package.json
COPY --from=build /workspace/app/backend/dist ./app/backend/dist
COPY app/db ./app/db
ENV NODE_ENV=production
CMD ["sh", "-c", "node app/backend/dist/migrate.js && node app/backend/dist/index.js"]
