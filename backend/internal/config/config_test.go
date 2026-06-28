package config

import (
	"strings"
	"testing"
)

func TestLoadRejectsUnsafeDefaults(t *testing.T) {
	t.Setenv("JWT_SECRET", "change-me-to-a-random-string-in-production")
	t.Setenv("INITIAL_PASSWORD", "admin123")

	_, err := Load()
	if err == nil {
		t.Fatal("expected unsafe defaults to be rejected")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected JWT_SECRET error, got %v", err)
	}
}

func TestLoadAcceptsStrongAuthConfig(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("INITIAL_PASSWORD", "Use-A-Strong-Password-123!")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected config to load: %v", err)
	}
	if cfg.JWTSecret == "" || cfg.InitialPassword == "" {
		t.Fatal("expected auth config to be populated")
	}
}
