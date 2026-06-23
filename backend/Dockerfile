# Stage 1: Build
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache ca-certificates

WORKDIR /src

# Cache dependencies.
COPY go.mod go.sum ./
RUN go mod download

# Build.
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# Stage 2: Runtime
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -H -h /app appuser

WORKDIR /app
COPY --from=builder /server .

# Create data directories with correct ownership.
RUN mkdir -p /app/data /app/uploads /app/uploads/tmp && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

VOLUME ["/app/uploads", "/app/data"]

CMD ["./server"]
