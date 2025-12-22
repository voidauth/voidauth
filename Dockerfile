#
# Frontend Builder
#
FROM dhi.io/node:24-alpine3.22-dev AS build-fe

WORKDIR /app/frontend

# Install the frontend
COPY ./frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY ./frontend ./
COPY ./shared ../shared

# Build frontend
RUN npm run build

#
# Backend Builder
#
FROM dhi.io/node:24-alpine3.22-dev AS build-be

WORKDIR /app

COPY ./package*.json ./

RUN npm ci

# Copy server files
COPY ./custom_typings ./custom_typings
COPY ./server ./server
COPY ./shared ./shared

# Run checks for correctness
COPY ./tsconfig.json ./
RUN npx tsc
COPY ./eslint.config.js ./
RUN npx eslint ./

# Build backend
COPY ./esbuild.config.ts ./
RUN npm run server:build

# Install external dependencies in dist folder
RUN cd ./dist && npm i

#
# Serve files and api endpoints
#
FROM dhi.io/node:24-alpine3.22 AS serve

WORKDIR /app

# Copy build files
COPY --from=build-fe --chmod=0777 /app/frontend/dist ./frontend/dist
COPY --from=build-be --chmod=0777 /app/dist/index.mjs ./dist/index.mjs
COPY --from=build-be --chmod=0777 /app/dist/node_modules ./node_modules

# Copy supporting files
COPY --chmod=0777 ./theme ./theme
COPY --chmod=0777 ./default_email_templates ./default_email_templates
COPY --chmod=0777 ./migrations ./migrations

# Needed for backwards compatibility
USER 0:0

VOLUME ["/app/config"]
VOLUME ["/app/db"]
EXPOSE 3000
ENTRYPOINT [ "node", "./dist/index.mjs" ]

HEALTHCHECK CMD ["node", "-e", "\"fetch('http://localhost:'+(process.env.APP_PORT||3000)+'/healthcheck').then(r=>process.exit(r.status===200?0:1)).catch(e=>process.exit(1))\""]
