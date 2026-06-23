package middleware

import (
	"context"
	"net/http"
	"strings"

	"blog-api/internal/apperror"
	"blog-api/internal/auth"
)

// contextKey is an unexported type used for context keys to prevent collisions.
type contextKey string

const claimsKey contextKey = "auth_claims"

// Auth returns middleware that verifies the JWT token from the Authorization
// header. On success, it injects the parsed Claims into the request context.
// On failure, it returns a 401 Unauthorized JSON response.
func Auth(jwtSecret []byte) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				apperror.WriteError(w, apperror.Unauthorized("missing or malformed authorization header"))
				return
			}

			claims, err := auth.ValidateToken(token, jwtSecret)
			if err != nil {
				// Log the specific reason internally but return a generic message.
				apperror.WriteError(w, apperror.Unauthorized("invalid or expired token"))
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractBearerToken extracts the token from an Authorization: Bearer <token> header.
func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	// Support both "Bearer <token>" and "bearer <token>"
	if len(authHeader) < 7 || !strings.EqualFold(authHeader[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(authHeader[7:])
}

// GetClaims extracts the JWT claims from the request context.
// Returns nil if the Auth middleware was not applied to this route.
func GetClaims(ctx context.Context) *auth.Claims {
	claims, _ := ctx.Value(claimsKey).(*auth.Claims)
	return claims
}
