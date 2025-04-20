FROM node:alpine AS build

# Create app directory
WORKDIR /app/frontend

# Build the frontend
COPY ./frontend/package-lock.json ./
COPY ./frontend/package.json ./
RUN npm i

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
COPY ./server ./
COPY ./shared ./
COPY ./theme ./
COPY ./migrations ./
COPY ./default_email_templates ./
COPY ./custom_typings ./

EXPOSE 80
CMD [ "npm", "run", "start:server" ]