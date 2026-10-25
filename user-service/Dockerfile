FROM node:22-alpine
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY package.json ./
COPY shared ./shared
COPY user-service ./user-service
USER node
EXPOSE 3001
CMD ["node", "user-service/server.js"]
