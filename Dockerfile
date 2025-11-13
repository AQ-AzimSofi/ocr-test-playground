# Backend Dockerfile for OCR Test Playground
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    poppler-utils

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for tsx)
RUN npm ci && npm cache clean --force

# Copy application code
COPY src ./src
COPY drizzle ./drizzle

# Create directories for uploads and results
RUN mkdir -p /app/results /app/test-drawings /app/uploads

# Environment
ENV NODE_ENV=production

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

# Start the API server using tsx
CMD ["npx", "tsx", "src/api/server.ts"]
