FROM node:25-alpine
WORKDIR /app

# Reference agent ships zero runtime deps — no install layer needed.
# Chown so the non-root user that runs the process can read them.
COPY --chown=node:node package.json server.js ./

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

# node:alpine already has a `node` user (uid/gid 1000). Drop from root
# before the server starts so a container-escape still lands outside
# root's capability set. Closes Dockerfile linter rule DS-0002.
USER node

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT}/.well-known/agent-card.json || exit 1

CMD ["node", "server.js"]
