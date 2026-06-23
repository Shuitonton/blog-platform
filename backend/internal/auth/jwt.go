// Package auth provides JWT signing/verification and bcrypt password hashing.
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	// DefaultTokenExpiry is the lifetime of issued JWTs.
	DefaultTokenExpiry = 24 * time.Hour

	// bcryptCost is the cost parameter for bcrypt hashing.
	bcryptCost = 12
)

// Claims represents the JWT claims carried in our tokens.
type Claims struct {
	jwt.RegisteredClaims
}

// SignToken creates a signed JWT string valid for the configured duration.
func SignToken(secret []byte, expiry time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(expiry)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// ValidateToken parses and validates a JWT token string.
// It verifies the signature using the provided secret and checks expiration.
func ValidateToken(tokenString string, secret []byte) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return secret, nil
		},
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("validate token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("validate token: invalid claims")
	}

	return claims, nil
}

// ---- password hashing ----

// HashPassword returns the bcrypt hash of a plain-text password.
func HashPassword(plain string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(bytes), nil
}

// CheckPassword compares a plain-text password against a bcrypt hash.
func CheckPassword(plain, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
	return err == nil
}
