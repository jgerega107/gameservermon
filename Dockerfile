FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY index.js ./

# Expose the metrics port
EXPOSE 9090

# Set default environment variables
ENV GAME_TYPE=minecraft
ENV GAME_HOST=localhost
ENV GAME_PORT=25565
ENV SCRAPE_INTERVAL=30000
ENV HTTP_PORT=9090

# Run the application
CMD ["node", "index.js"]
