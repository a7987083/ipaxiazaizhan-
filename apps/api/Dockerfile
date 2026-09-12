FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm run start"]
