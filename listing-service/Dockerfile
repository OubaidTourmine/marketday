FROM node:22-alpine
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY package.json ./
COPY shared ./shared
COPY listing-service ./listing-service
USER node
EXPOSE 3002
CMD ["node", "listing-service/server.js"]
