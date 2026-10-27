FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY api-gateway ./api-gateway
USER node
EXPOSE 8080
CMD ["node", "api-gateway/server.js"]
