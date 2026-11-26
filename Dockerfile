FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Kolkata
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
USER node
CMD ["node", "src/server.js"]
