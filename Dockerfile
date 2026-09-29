# Emberwild — production image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY client ./client
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# graceful stop saves every world (SIGTERM handled by the server)
STOPSIGNAL SIGTERM
CMD ["node", "server/index.js"]
