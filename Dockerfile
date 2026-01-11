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

# Environment - defaults to simulated, override for real MCP
ENV NODE_ENV=production
ENV GENESIS_MCP_MODE=simulated

# API Keys - pass via docker run -e or docker-compose
# ENV OPENAI_API_KEY=
# ENV GEMINI_API_KEY=
# ENV GITHUB_PERSONAL_ACCESS_TOKEN=
# ENV FIRECRAWL_API_KEY=
# ENV EXA_API_KEY=
# ENV BRAVE_API_KEY=
# ENV STABILITY_AI_API_KEY=
# ENV WOLFRAM_APP_ID=

# Expose for potential HTTP API
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Default command: show help
CMD ["node", "dist/src/index.js", "help"]
