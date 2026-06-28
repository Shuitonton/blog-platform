package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"blog-api/internal/apperror"
	"blog-api/internal/auth"
	"blog-api/internal/store"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	store           *store.Store
	secret          []byte
	initialPassword string
	tokenExpiry     time.Duration
	turnstileSecret string
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(s *store.Store, jwtSecret []byte, initialPassword string, tokenExpiry time.Duration, turnstileSecret string) *AuthHandler {
	return &AuthHandler{
		store:           s,
		secret:          jwtSecret,
		initialPassword: initialPassword,
		tokenExpiry:     tokenExpiry,
		turnstileSecret: turnstileSecret,
	}
}

// LoginRequest is the expected JSON body for POST /api/auth/login.
type LoginRequest struct {
	Password string `json:"password"`
}

// LoginResponse is the JSON body returned on successful login.
type LoginResponse struct {
	Token string `json:"token"`
}

// Login handles POST /api/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) error {
	// Parse and validate the request body.
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<14)) // 16KB max
	if err != nil {
		return apperror.Internal("failed to read request body", err)
	}
	defer r.Body.Close()

	var req LoginRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return apperror.Validation("invalid JSON body", map[string]any{"error": err.Error()})
	}

	if req.Password == "" {
		return apperror.Validation("password is required", nil)
	}

	// Retrieve the stored password hash.
	var storedHash string
	err = h.store.DB().QueryRowContext(r.Context(), `SELECT password_hash FROM auth WHERE id = 1`).Scan(&storedHash)
	if err == sql.ErrNoRows || storedHash == "" {
		// First run: initialize from trusted server-side configuration only.
		hash, hashErr := auth.HashPassword(h.initialPassword)
		if hashErr != nil {
			return apperror.Internal("failed to hash password", hashErr)
		}
		_, execErr := h.store.DB().ExecContext(r.Context(),
			`INSERT OR REPLACE INTO auth (id, password_hash) VALUES (1, ?)`, hash,
		)
		if execErr != nil {
			return apperror.Internal("failed to store initial password", execErr)
		}
		slog.Info("initial password set")
		storedHash = hash
	} else if err != nil {
		return apperror.Internal("failed to query stored password", err)
	}

	// Verify the password.
	if !auth.CheckPassword(req.Password, storedHash) {
		return apperror.Unauthorized("invalid password")
	}

	// Sign a JWT.
	expiry := h.tokenExpiry
	if expiry <= 0 {
		expiry = auth.DefaultTokenExpiry
	}
	token, err := auth.SignToken(h.secret, expiry)
	if err != nil {
		return apperror.Internal("failed to sign token", err)
	}

	apperror.WriteSuccess(w, LoginResponse{Token: token})
	return nil
}

// TurnstileRequest is the expected JSON body for POST /api/verify-turnstile.
type TurnstileRequest struct {
	Token string `json:"token"`
}

type turnstileResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes"`
	Hostname   string   `json:"hostname"`
	Action     string   `json:"action"`
	CData      string   `json:"cdata"`
}

// VerifyTurnstile handles POST /api/verify-turnstile.
// It validates the Turnstile token with Cloudflare's server-side API.
func (h *AuthHandler) VerifyTurnstile(w http.ResponseWriter, r *http.Request) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<14))
	if err != nil {
		return apperror.Internal("failed to read request body", err)
	}
	defer r.Body.Close()

	var req TurnstileRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return apperror.Validation("invalid JSON body", map[string]any{"error": err.Error()})
	}

	if req.Token == "" {
		return apperror.Validation("token is required", nil)
	}

	if h.turnstileSecret == "" {
		return apperror.Forbidden("turnstile verification is not configured")
	}

	form := url.Values{
		"secret":   {h.turnstileSecret},
		"response": {req.Token},
	}
	if ip := clientIP(r); ip != "" {
		form.Set("remoteip", ip)
	}

	verifyReq, err := http.NewRequestWithContext(
		r.Context(),
		http.MethodPost,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return apperror.Internal("failed to create turnstile verification request", err)
	}
	verifyReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(verifyReq)
	if err != nil {
		return apperror.Internal("turnstile verification request failed", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return apperror.Internal("turnstile verification returned non-200 status", fmt.Errorf("status=%d", resp.StatusCode))
	}

	var result turnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return apperror.Internal("failed to decode turnstile response", err)
	}

	if !result.Success {
		return apperror.Unauthorized("turnstile verification failed: " + strings.Join(result.ErrorCodes, ","))
	}

	apperror.WriteSuccess(w, map[string]bool{"verified": true})
	return nil
}

func clientIP(r *http.Request) string {
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
