# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Default values (overridden by .env)
ENV HOST=0.0.0.0
ENV PORT=3009

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose the port
EXPOSE ${PORT}

# Run the preview server using HOST and PORT from env
CMD ["sh", "-c", "npm run preview -- --host ${HOST} --port ${PORT}"]
