# Genesis v7.2 - Self-Simulation Container
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV GENESIS_MCP_MODE=simulated

# Expose for potential HTTP API
EXPOSE 3001

# Default command: show help
CMD ["node", "dist/src/index.js", "help"]
