FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
COPY dashboard/package.json dashboard/package.json
COPY agent/package.json agent/package.json
RUN npm install
COPY agent agent
RUN npm run build -w @hanoi-lab/agent
FROM node:24-alpine
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/agent/dist ./agent/dist
EXPOSE 3001
CMD ["node", "agent/dist/index.js"]
