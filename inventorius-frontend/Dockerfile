FROM node:20-alpine AS build
WORKDIR /app

# install dependencies
COPY package*.json ./
RUN npm ci

# copy sources and build
COPY . .
RUN npm run build:client && npm run build:server

# runtime image
FROM node:20-alpine
ENV NODE_ENV=production
ENV API_HOSTNAME=http://api:8000
WORKDIR /app
COPY --from=build /app/dist /app/dist
COPY public /app/public
EXPOSE 3001
CMD ["node", "dist/server.bundle.js", "-p", "3001"]
