#
# Builder
#
FROM node:24-alpine3.22 AS install

WORKDIR /app

# Install BE dependencies
COPY ./package*.json ./
RUN npm ci

# Install FE dependencies
COPY ./frontend/package*.json ./frontend/
RUN cd ./frontend && npm ci

# Copy BE files
COPY ./custom_typings ./custom_typings
COPY ./server ./server
COPY ./shared ./shared

# Copy FE files
COPY ./frontend ./frontend

# Run checks for correctness
COPY ./tsconfig.json ./
RUN npx tsc
COPY ./eslint.config.js ./
RUN npx eslint ./

# Build backend
COPY ./esbuild.config.ts ./
RUN npm run server:build

# Build frontend
RUN cd ./frontend && npm run build

# Install external dependencies in dist folder
RUN cd ./dist && npm i

# 
# Compile all outputs into /app folder
# 
FROM node:24-alpine3.22 AS build

WORKDIR /app

# Copy install and build files
COPY --from=install --chmod=0777 /app/frontend/dist ./frontend/dist
COPY --from=install --chmod=0777 /app/dist/index.mjs ./dist/index.mjs
COPY --from=install --chmod=0777 /app/dist/node_modules ./node_modules

# Copy supporting files
COPY --chmod=0777 ./theme ./theme
COPY --chmod=0777 ./default_email_templates ./default_email_templates
COPY --chmod=0777 ./migrations ./migrations

#
# Serve files and api endpoints
# Requires a login to dhi.io
#
FROM dhi.io/node:24-alpine3.22 AS serve

WORKDIR /app

# Copy build files
COPY --from=build --chmod=0777 /app ./

# Ensure executable
RUN [ "node", "./dist/index.mjs", "--help" ]

# Needed for backwards compatibility
USER 0:0

VOLUME ["/app/config"]
VOLUME ["/app/db"]
EXPOSE 3000
ENTRYPOINT [ "node", "./dist/index.mjs" ]

HEALTHCHECK CMD ["node", "-e", "\"fetch('http://localhost:'+(process.env.APP_PORT||3000)+'/healthcheck').then(r=>process.exit(r.status===200?0:1)).catch(e=>process.exit(1))\""]
