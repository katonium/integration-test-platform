# Use official golang image as builder
FROM golang:1.21-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go files
COPY . .

# Build the binary
RUN go build -o echo-server main.go

# Use minimal alpine image for final stage
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

# Set working directory
WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/echo-server .

# Expose port 8080
EXPOSE 8080

# Run the binary
CMD ["./echo-server"]