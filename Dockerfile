FROM node:lts-alpine

# Create app user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

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
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the metrics port
EXPOSE 9090

# Set default environment variables
ENV GAME_TYPE=minecraft
ENV GAME_HOST=localhost
ENV GAME_PORT=25565
ENV HTTP_PORT=9090

# Run the application
CMD ["node", "index.js"]
