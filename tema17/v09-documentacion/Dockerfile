FROM node:24.19.0-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
