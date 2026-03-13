FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first (for layer caching)
COPY package.json ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY tsconfig.json vite.config.ts index.html server.js gameConfig.js ./
COPY src/ ./src/

# Build frontend
RUN pnpm build

# Expose port
EXPOSE 9932

# Start server
CMD ["node", "server.js"]
