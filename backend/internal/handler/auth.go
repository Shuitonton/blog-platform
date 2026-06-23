package handler

import (
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"blog-api/internal/apperror"
	"blog-api/internal/auth"
	"blog-api/internal/store"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	store  *store.Store
	secret []byte
	expiry int // seconds
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(s *store.Store, jwtSecret []byte, expiry int) *AuthHandler {
	return &AuthHandler{store: s, secret: jwtSecret, expiry: expiry}
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
		// First run — hash and store the given password.
		hash, hashErr := auth.HashPassword(req.Password)
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
	token, err := auth.SignToken(h.secret, auth.DefaultTokenExpiry)
	if err != nil {
		return apperror.Internal("failed to sign token", err)
	}

	apperror.WriteSuccess(w, LoginResponse{Token: token})
	return nil
}
