# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and lockfile first for caching
COPY package.json pnpm-lock.yaml ./

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# Build Next.js app
RUN pnpm build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Copy built assets and node_modules from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose port
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]
