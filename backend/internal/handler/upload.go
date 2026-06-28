package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"blog-api/internal/apperror"
	"blog-api/internal/store"
	"blog-api/internal/upload"
)

// UploadHandler handles file uploads for entities that need single-file upload
// before the full entity is saved (e.g. avatars, favicons, social icons).
type UploadHandler struct {
	store     *store.Store
	uploadDir string
	tempDir   string
}

// NewUploadHandler creates an UploadHandler.
func NewUploadHandler(s *store.Store, uploadDir string) *UploadHandler {
	return &UploadHandler{
		store:     s,
		uploadDir: uploadDir,
		tempDir:   uploadDir + "/tmp",
	}
}

// Upload handles POST /api/upload.
// Accepts a single file in the "file" field.
// Returns the public URL path on success.
func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) error {
	r.Body = http.MaxBytesReader(nil, r.Body, upload.MaxFileSize+1<<10)

	if err := r.ParseMultipartForm(upload.MaxFileSize + 1<<10); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			return apperror.PayloadTooLarge("file exceeds maximum size")
		}
		return apperror.Validation("failed to parse upload", map[string]any{"error": err.Error()})
	}

	fileHeaders, ok := r.MultipartForm.File["file"]
	if !ok || len(fileHeaders) == 0 {
		return apperror.Validation("no file provided in 'file' field", nil)
	}
	if len(fileHeaders) > 1 {
		return apperror.Validation("only one file allowed per upload request", nil)
	}

	// Validate and save to temp.
	tf, err := upload.ValidateFileHeader(fileHeaders[0], h.tempDir)
	if err != nil {
		return err
	}
	defer tf.Cleanup()

	// HashAndSave within a transaction.
	var publicPath string
	err = h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		record, saveErr := upload.HashAndSave(tx, tf, h.uploadDir)
		if saveErr != nil {
			return saveErr
		}
		publicPath = record.PublicPath()
		return nil
	})
	if err != nil {
		return err
	}

	apperror.WriteSuccess(w, map[string]string{
		"url":  publicPath,
		"hash": tf.Hash,
	})
	return nil
}

// ServeStatic serves uploaded files from disk at GET /uploads/*.
// This should be mounted as a file server in the router, not as a handler func.
func ServeStatic(uploadDir string) http.Handler {
	// Verify the upload directory exists, create if not.
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		panic(fmt.Sprintf("cannot create upload directory %s: %v", uploadDir, err))
	}

	base, err := filepath.Abs(uploadDir)
	if err != nil {
		panic(fmt.Sprintf("cannot resolve upload directory %s: %v", uploadDir, err))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/uploads/")
		if name == "" || strings.Contains(name, "\x00") {
			http.NotFound(w, r)
			return
		}

		cleanName := filepath.Clean(name)
		if cleanName == "." || strings.HasPrefix(cleanName, ".."+string(filepath.Separator)) || cleanName == ".." {
			http.NotFound(w, r)
			return
		}

		target := filepath.Join(base, cleanName)
		if !strings.HasPrefix(target, base+string(filepath.Separator)) && target != base {
			http.NotFound(w, r)
			return
		}

		info, statErr := os.Stat(target)
		if statErr != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.EqualFold(filepath.Ext(target), ".svg") {
			w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(target)+`"`)
		}
		http.ServeFile(w, r, target)
	})
}

// CleanTempDir removes all files in the temp directory. Called on startup.
func CleanTempDir(tempDir string) {
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		return // directory might not exist yet — fine
	}
	for _, entry := range entries {
		path := filepath.Join(tempDir, entry.Name())
		os.Remove(path)
	}
}
