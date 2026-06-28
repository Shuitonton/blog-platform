package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"blog-api/internal/apperror"
)

type rateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	attempts map[string][]time.Time
}

// RateLimit limits requests by remote IP over a rolling window.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	rl := &rateLimiter{
		limit:    limit,
		window:   window,
		attempts: make(map[string][]time.Time),
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !rl.allow(remoteIP(r)) {
				apperror.WriteError(w, apperror.TooManyRequests("too many login attempts, please try again later"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-rl.window)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	items := rl.attempts[key]
	keep := items[:0]
	for _, t := range items {
		if t.After(cutoff) {
			keep = append(keep, t)
		}
	}
	if len(keep) >= rl.limit {
		rl.attempts[key] = keep
		return false
	}
	keep = append(keep, now)
	rl.attempts[key] = keep
	return true
}

func remoteIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || host == "" {
		return r.RemoteAddr
	}
	return host
}
