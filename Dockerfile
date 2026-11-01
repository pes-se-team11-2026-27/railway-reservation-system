FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
COPY public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm run seed:if-empty && npm start"]
