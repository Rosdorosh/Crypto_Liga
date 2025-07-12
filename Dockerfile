FROM node:16-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Frontend build is skipped as it's already built locally

EXPOSE 3000

CMD ["node", "backend/server.js"] 