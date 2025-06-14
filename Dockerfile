# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S testuser && \
    adduser -S testuser -u 1001 -G testuser

# Change ownership of app directory
RUN chown -R testuser:testuser /app

# Switch to non-root user
USER testuser

# Create directory for test files
RUN mkdir -p /app/tests

# Expose any ports if needed (optional)
# EXPOSE 3000

# Set the entrypoint
ENTRYPOINT ["node", "dist/index.js"]

# # Default command shows help
CMD ["--help"]

# RUN chmod +x entrypoint.sh

# CMD ["./entrypoint.sh"]
# ENTRYPOINT ["/bin/bash", "./entrypoint.sh"]

