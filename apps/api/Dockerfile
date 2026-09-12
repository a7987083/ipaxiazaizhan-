FROM node:22-alpine
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install --omit=dev
COPY apps/api ./
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm run start"]
