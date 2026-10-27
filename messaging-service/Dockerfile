FROM node:22-alpine
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY package.json ./
COPY shared ./shared
COPY messaging-service ./messaging-service
USER node
EXPOSE 3003
CMD ["node", "messaging-service/server.js"]
