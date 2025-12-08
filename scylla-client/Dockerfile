# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code (including .env for Vite to pick up VITE_* vars at build time)
COPY . .

# Build the application
RUN npm run build

# Production stage - use serve to host static files
FROM node:20-alpine AS production

WORKDIR /app

# Default values (overridden by .env)
ENV HOST=0.0.0.0
ENV PORT=3009

# Install serve globally
RUN npm install -g serve

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose the port
EXPOSE ${PORT}

# Serve the static files
CMD ["sh", "-c", "serve -s dist -l tcp://${HOST}:${PORT}"]
