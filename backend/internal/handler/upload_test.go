package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestServeStaticDoesNotListDirectories(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "image.png"), []byte("not really a png"), 0644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/uploads/", nil)
	resp := httptest.NewRecorder()
	ServeStatic(dir).ServeHTTP(resp, req)

	if resp.Code != http.StatusNotFound {
		t.Fatalf("expected directory request to be hidden, got %d", resp.Code)
	}
}

func TestServeStaticForcesSVGDownload(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "legacy.svg"), []byte("<svg></svg>"), 0644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/uploads/legacy.svg", nil)
	resp := httptest.NewRecorder()
	ServeStatic(dir).ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected svg file to be served, got %d", resp.Code)
	}
	if got := resp.Header().Get("Content-Disposition"); got == "" {
		t.Fatal("expected svg response to force attachment download")
	}
}
