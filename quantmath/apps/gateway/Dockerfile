# Dockerfile for NestJS + pnpm caching
FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy only package files first to leverage Docker layer caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile (will cache this layer)
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the project
RUN pnpm run build

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
