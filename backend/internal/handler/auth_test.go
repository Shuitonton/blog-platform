package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"blog-api/internal/store"
)

func TestLoginInitializesFromServerPasswordOnly(t *testing.T) {
	st, err := store.Open(context.Background(), t.TempDir()+"/blog.db")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	h := NewAuthHandler(st, []byte("0123456789abcdef0123456789abcdef"), "Server-Password-123!", time.Hour)

	wrongReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"password":"attacker-password"}`))
	wrongResp := httptest.NewRecorder()
	if err := h.Login(wrongResp, wrongReq); err == nil {
		t.Fatal("expected first untrusted password to be rejected")
	}
	rightReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(`{"password":"Server-Password-123!"}`))
	rightResp := httptest.NewRecorder()
	if err := h.Login(rightResp, rightReq); err != nil {
		t.Fatalf("server password login returned handler error: %v", err)
	}
	if rightResp.Code != http.StatusOK {
		t.Fatalf("expected server password to authenticate, got %d body=%s", rightResp.Code, rightResp.Body.String())
	}
}
