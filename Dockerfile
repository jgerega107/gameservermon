FROM node:lts-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application files
COPY index.js ./

# Change ownership to app user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose the metrics port
EXPOSE 9090

# Run the application
CMD ["node", "index.js"]
