FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Self signed certificate for local and demo HTTPS (RRS-SR-001).
# A real deployment mounts a certificate from a certificate authority instead.
RUN apk add --no-cache openssl \
 && mkdir -p certs \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
      -keyout certs/key.pem -out certs/cert.pem
COPY src ./src
COPY db ./db
COPY public ./public
ENV NODE_ENV=production
EXPOSE 3000 3443
CMD ["sh", "-c", "npm run migrate && npm run seed:if-empty && npm start"]
