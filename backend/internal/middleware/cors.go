package middleware

import (
	"net/http"

	"github.com/go-chi/cors"
)

// CORS returns a CORS middleware configured with the given allowed origins.
// In development, pass "*" to allow all origins. In production, restrict to
// the frontend's domain.
func CORS(allowedOrigins []string) func(next http.Handler) http.Handler {
	allowCredentials := true
	for _, origin := range allowedOrigins {
		if origin == "*" {
			allowCredentials = false
			break
		}
	}
	return cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		ExposedHeaders:   []string{"Content-Type", "Content-Disposition"},
		AllowCredentials: allowCredentials,
		MaxAge:           86400, // 24 hours
	})
}

// PermissiveCORS returns a CORS middleware that allows all origins.
// Use only for development.
func PermissiveCORS() func(next http.Handler) http.Handler {
	return CORS([]string{"*"})
}
