FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=3003
EXPOSE 3003
CMD ["npm","start"]
