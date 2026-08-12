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
WORKDIR /app

# Copy package.json and package-lock.json from server folder
COPY server/package*.json ./server/

# Install dependencies in the server directory
RUN cd server && npm ci --omit=dev

# Copy server and frontend directories
COPY server/ ./server/
COPY frontend/ ./frontend/

# Create uploads directory and fix permissions
RUN mkdir -p /app/uploads && chown -R node:node /app

# Switch to non-root user for security
USER node

# Set working directory to server
WORKDIR /app/server

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
