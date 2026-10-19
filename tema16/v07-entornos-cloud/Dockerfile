FROM node:24-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
