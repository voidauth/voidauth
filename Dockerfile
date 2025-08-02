FROM node:lts-alpine AS build

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
FROM node:lts-alpine AS serve

# Create app directory
WORKDIR /app

# Copy server package json files
COPY ./package*.json ./

# Install the server
RUN npm ci --omit=dev

# Copy server files
COPY ./theme ./theme
COPY ./default_email_templates ./default_email_templates
COPY ./custom_typings ./custom_typings
COPY ./tsconfig.json ./
COPY ./migrations ./migrations
COPY ./server ./server
COPY ./shared ./shared

# Copy web files from builder
COPY --from=build /app/frontend/dist ./frontend/dist

VOLUME ["/app/config"]
EXPOSE 3000
CMD [ "npm", "run", "start:server" ]

# Basic Typescript Checking
FROM serve AS test

RUN npm ci

RUN npx tsc
RUN npx eslint .
