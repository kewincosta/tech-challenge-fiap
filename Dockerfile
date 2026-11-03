FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild argon2
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# typeorm names ts-node as an optional peer, and npm keeps it, with typescript and @swc/core, unless
# the optional packages go too.
RUN npm run build && npm prune --omit=dev --omit=optional

# The certificate authorities of Amazon RDS, which DATABASE_SSL_CA names when the database is RDS.
FROM node:24-slim AS rds-bundle
ADD --chmod=0644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /rds-global-bundle.pem
RUN test "$(grep -c 'BEGIN CERTIFICATE' /rds-global-bundle.pem)" -gt 1

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=rds-bundle /rds-global-bundle.pem ./certs/rds-global-bundle.pem
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
