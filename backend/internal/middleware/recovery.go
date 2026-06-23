package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"blog-api/internal/apperror"
)

// Recovery returns middleware that catches panics in downstream handlers,
// logs the stack trace, and returns a 500 Internal Server Error JSON response.
//
// This must be the outermost middleware in the stack so it catches panics
// from all other middleware and handlers.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error(
					"panic recovered",
					"panic", rec,
					"method", r.Method,
					"path", r.URL.Path,
					"stack", string(debug.Stack()),
				)
				apperror.WriteError(w, apperror.Internal(
					"an unexpected error occurred", nil,
				))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
