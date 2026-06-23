# Stage 1: Build the Go binary
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY backend/ ./backend
COPY migrations/ ./migrations

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./backend/cmd/main.go

# Stage 2: Run stage
FROM alpine:3.19

WORKDIR /app

# Copy the binary and migrations
COPY --from=builder /app/main .
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./main"]
