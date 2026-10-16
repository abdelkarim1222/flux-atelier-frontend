FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:22-alpine AS api

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
EXPOSE 3001
CMD ["npm", "start"]

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
