FROM node:24-alpine
WORKDIR /app

# Reference agent ships zero runtime deps — no install layer needed.
COPY package.json server.js ./

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT}/.well-known/agent-card.json || exit 1

CMD ["node", "server.js"]
