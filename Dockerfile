FROM node:alpine AS build

# Create app directory
WORKDIR /app/frontend

# Build the frontend
COPY ./frontend/package-lock.json ./
COPY ./frontend/package.json ./
RUN npm ci

# Copy frontend source
COPY ./frontend ./
COPY ./shared ../shared

# Build the page
RUN npm run build


# Serve files and api endpoints
FROM node:alpine AS serve

# Create app directory
WORKDIR /app

# Copy web files from builder
COPY --from=build /app/frontend/dist ./frontend/dist

# Copy server package json files
COPY ./package*.json ./

# Install the server
RUN npm ci --omit=dev

# Copy server files
COPY ./theme ./theme
COPY ./default_email_templates ./default_email_templates

COPY ./tsconfig.json ./

COPY ./server ./server
COPY ./shared ./shared
COPY ./migrations ./migrations
COPY ./custom_typings ./custom_typings

VOLUME ["/app/db", "/app/config"]
EXPOSE 80
CMD [ "npm", "run", "start:server" ]