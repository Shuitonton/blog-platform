package middleware

import (
	"net"
	"net/http"
	"strings"
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

	// 定期清理过期 key，防止内存泄漏
	go rl.startCleanup(5 * time.Minute)

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
		if len(keep) == 0 {
			delete(rl.attempts, key)
		} else {
			rl.attempts[key] = keep
		}
		return false
	}
	keep = append(keep, now)
	if len(keep) == 0 {
		delete(rl.attempts, key)
	} else {
		rl.attempts[key] = keep
	}
	return true
}

// startCleanup 定期清理 map 中的过期 key，防止内存泄漏
func (rl *rateLimiter) startCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rl.window)
		for key, times := range rl.attempts {
			n := 0
			for _, t := range times {
				if t.After(cutoff) {
					times[n] = t
					n++
				}
			}
			if n == 0 {
				delete(rl.attempts, key)
			} else {
				rl.attempts[key] = times[:n]
			}
		}
		rl.mu.Unlock()
	}
}

func remoteIP(r *http.Request) string {
	// 优先读取反向代理传过来的真实 IP
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.IndexByte(xff, ','); idx >= 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || host == "" {
		return r.RemoteAddr
	}
	return host
}
