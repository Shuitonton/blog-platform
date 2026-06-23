// Package config provides typed, validated configuration from environment variables.
// All values have sensible defaults where possible; secrets must be explicitly set.
package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all application configuration, validated and ready for use.
type Config struct {
	// Server
	ListenAddr string

	// Database
	DBPath string

	// File storage
	UploadDir     string
	MaxFileSize   int64 // per-file limit, bytes
	MaxTotalSize  int64 // per-request limit, bytes
	MaxFilesCount int   // max files per multipart request

	// Auth
	JWTSecret       string
	InitialPassword string
	TokenExpiry     time.Duration

	// CORS
	CORSOrigins []string

	// Logging
	LogLevel slog.Level
}

// Load reads configuration from environment variables.
// It returns an error if required values are missing.
func Load() (*Config, error) {
	cfg := &Config{
		ListenAddr:     getEnv("LISTEN_ADDR", ":8080"),
		DBPath:         getEnv("DB_PATH", "data/blog.db"),
		UploadDir:      getEnv("UPLOAD_DIR", "uploads"),
		MaxFileSize:    getEnvInt64("MAX_FILE_SIZE", 50*1024*1024),   // 50 MB
		MaxTotalSize:   getEnvInt64("MAX_TOTAL_SIZE", 100*1024*1024),  // 100 MB
		MaxFilesCount:  getEnvInt("MAX_FILES_COUNT", 20),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		InitialPassword: getEnv("INITIAL_PASSWORD", "admin123"),
		TokenExpiry:    getEnvDuration("TOKEN_EXPIRY", 24*time.Hour),
		CORSOrigins:    parseCORSOrigins(getEnv("CORS_ORIGINS", "*")),
		LogLevel:       parseLogLevel(getEnv("LOG_LEVEL", "info")),
	}

	if cfg.JWTSecret == "" {
		return nil, &ConfigError{Field: "JWT_SECRET", Message: "must be set and non-empty"}
	}
	if cfg.InitialPassword == "" {
		return nil, &ConfigError{Field: "INITIAL_PASSWORD", Message: "must be set and non-empty"}
	}

	return cfg, nil
}

// ConfigError indicates a configuration problem.
type ConfigError struct {
	Field   string
	Message string
}

func (e *ConfigError) Error() string {
	return "config error: " + e.Field + " — " + e.Message
}

// ---- env helpers ----

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func parseCORSOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) == 0 {
		return []string{"*"}
	}
	return result
}

func parseLogLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
