FROM node:26-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy application files
COPY index.js ./

# Change ownership to app user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose the metrics port
EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.HTTP_PORT || 9090) + '/live').then(res => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run the application
CMD ["node", "index.js"]
