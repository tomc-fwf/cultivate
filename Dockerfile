FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc --project tsconfig.json

RUN npm prune --omit=dev

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV DB_PATH=/data/farmstock.db
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get({hostname:'localhost',port:process.env.PORT||3002,path:'/health'},r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/api/server.js"]
