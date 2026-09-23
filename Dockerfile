FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node public ./public
COPY --chown=node:node lib ./lib
COPY --chown=node:node server.mjs ./
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8840
EXPOSE 8840
CMD ["node", "server.mjs"]
