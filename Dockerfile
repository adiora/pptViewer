FROM node:18-bullseye-slim

# Install LibreOffice and its dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-common \
    fonts-liberation \
    fonts-croscore \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json from server folder
COPY server/package*.json ./

# Install dependencies
RUN npm install --production

# Copy server and frontend
COPY server/ ./server/
COPY frontend/ ./frontend/
COPY docs/ ./docs/

# Set working directory to server
WORKDIR /usr/src/app/server

# Expose port
EXPOSE 3000

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Start server
CMD ["node", "server.js"]
