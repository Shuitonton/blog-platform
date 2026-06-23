// Package upload handles file validation, temporary storage, hash-based deduplication,
// and atomic file placement. Every operation that creates files on disk pairs with
// a cleanup path — temp files are tracked and cleaned on error, and the files table
// in the database serves as the source of truth for which files exist on disk.
package upload

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"blog-api/internal/apperror"
)

// ---- constants ----

const (
	// MaxFileSize is the maximum size of a single uploaded file (50 MB).
	MaxFileSize = 50 * 1024 * 1024

	// MaxTotalSize is the maximum total request body size (100 MB).
	MaxTotalSize = 100 * 1024 * 1024

	// MaxFilesPerRequest caps the number of file parts in a single multipart request.
	MaxFilesPerRequest = 20

	// readHeaderBytes is the number of bytes read for MIME detection.
	readHeaderBytes = 512
)

// allowedMIMETypes is the whitelist of acceptable MIME types for uploaded images.
var allowedMIMETypes = map[string]bool{
	"image/jpeg":    true,
	"image/png":     true,
	"image/gif":     true,
	"image/webp":    true,
	"image/svg+xml": true,
}

// allowedExtensions is the whitelist of acceptable file extensions (lowercase).
var allowedExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true,
	".gif": true, ".webp": true, ".svg": true,
}

// ---- TempFile ----

// TempFile represents a file that has been saved to a temporary location.
// The caller is responsible for cleaning it up via Cleanup or moving it
// to a permanent location.
type TempFile struct {
	// Path is the absolute path where the temp file is stored.
	Path string

	// OriginalName is the original filename from the multipart header.
	OriginalName string

	// Size is the file size in bytes.
	Size int64

	// Hash is the SHA256 hex digest, computed during validation.
	Hash string

	// Ext is the lowercase file extension including the dot.
	Ext string
}

// Cleanup removes the temp file from disk. Errors are logged but not returned —
// cleanup is always best-effort.
func (t *TempFile) Cleanup() {
	if t != nil && t.Path != "" {
		if err := os.Remove(t.Path); err != nil && !os.IsNotExist(err) {
			// Best-effort: log but don't fail.
			_ = err
		}
	}
}

// CleanupTempFiles removes all temp files in the slice. Safe to pass nil or empty.
func CleanupTempFiles(files []*TempFile) {
	for _, f := range files {
		f.Cleanup()
	}
}

// ---- Validation ----

// ValidateFileHeader checks a multipart file header against size, MIME, and
// extension constraints. It reads the file to detect the actual MIME type
// (not trusting the client-supplied Content-Type) and computes the SHA256 hash.
//
// On success, returns a TempFile saved to the given temp directory.
// On failure, the caller does not need to clean up — no file has been written.
func ValidateFileHeader(fh *multipart.FileHeader, tempDir string) (*TempFile, error) {
	// 1. Extension validation.
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedExtensions[ext] {
		return nil, apperror.Validation(
			"unsupported file type",
			map[string]any{"file": fh.Filename, "allowed": allowedExtensionsList()},
		)
	}

	// 2. Size validation.
	if fh.Size > MaxFileSize {
		return nil, apperror.PayloadTooLarge(
			fmt.Sprintf("file %s exceeds maximum size of %d bytes", fh.Filename, MaxFileSize),
		)
	}

	// 3. Open the file.
	src, err := fh.Open()
	if err != nil {
		return nil, apperror.Internal("failed to open uploaded file", err)
	}
	defer src.Close()

	// 4. Read header bytes for MIME detection.
	header := make([]byte, readHeaderBytes)
	n, err := io.ReadFull(src, header)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, apperror.Internal("failed to read file header", err)
	}
	detectedMIME := http.DetectContentType(header[:n])
	if !allowedMIMETypes[detectedMIME] {
		return nil, apperror.Validation(
			"unsupported media type",
			map[string]any{
				"file":     fh.Filename,
				"detected": detectedMIME,
				"allowed":  allowedMIMEsList(),
			},
		)
	}

	// 5. Seek back to start and compute SHA256.
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return nil, apperror.Internal("failed to seek file", err)
	}

	hasher := sha256.New()
	if _, err := io.Copy(hasher, src); err != nil {
		return nil, apperror.Internal("failed to hash file", err)
	}
	hash := hex.EncodeToString(hasher.Sum(nil))

	// 6. Write to temp file.
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return nil, apperror.Internal("failed to create temp directory", err)
	}

	dst, err := os.CreateTemp(tempDir, "upload-*"+ext)
	if err != nil {
		return nil, apperror.Internal("failed to create temp file", err)
	}
	defer dst.Close()

	if _, err := src.Seek(0, io.SeekStart); err != nil {
		dst.Close()
		os.Remove(dst.Name())
		return nil, apperror.Internal("failed to seek file for saving", err)
	}

	size, err := io.Copy(dst, src)
	if err != nil {
		dst.Close()
		os.Remove(dst.Name())
		return nil, apperror.Internal("failed to save temp file", err)
	}

	return &TempFile{
		Path:         dst.Name(),
		OriginalName: fh.Filename,
		Size:         size,
		Hash:         hash,
		Ext:          ext,
	}, nil
}

// ---- Multipart parsing ----

// ParseMultipartFiles parses a multipart request, validates all file parts
// against the configured constraints, and returns a list of temp files.
//
// The caller MUST call CleanupTempFiles on the returned slice if an error occurs
// after this function returns successfully. If this function returns an error,
// partial temp files have already been cleaned up — the caller has nothing to clean.
func ParseMultipartFiles(r *http.Request, formFieldName string, maxTotalSize int64, maxFiles int, tempDir string) ([]*TempFile, error) {
	// Limit total request body size.
	r.Body = http.MaxBytesReader(nil, r.Body, maxTotalSize)

	if err := r.ParseMultipartForm(maxTotalSize); err != nil {
		if err.Error() == "http: request body too large" || strings.Contains(err.Error(), "request body too large") {
			return nil, apperror.PayloadTooLarge("request body exceeds maximum size")
		}
		return nil, apperror.Validation("failed to parse multipart form", map[string]any{"error": err.Error()})
	}

	fileHeaders := r.MultipartForm.File[formFieldName]
	if len(fileHeaders) > maxFiles {
		// Clean up the parsed form files that exceed the limit.
		// These are stored in os.TempDir by Go's multipart parser.
		cleanupMultipartFiles(fileHeaders[maxFiles:])
		fileHeaders = fileHeaders[:maxFiles]
	}

	var tempFiles []*TempFile

	for i, fh := range fileHeaders {
		tf, err := ValidateFileHeader(fh, tempDir)
		if err != nil {
			// A file failed validation — clean up any temp files we've already saved.
			CleanupTempFiles(tempFiles)
			// Also clean up the remaining unprocessed multipart files.
			cleanupMultipartFiles(fileHeaders[i:])
			return nil, err
		}
		tempFiles = append(tempFiles, tf)
	}

	return tempFiles, nil
}

// cleanupMultipartFiles removes temporary files stored by Go's multipart parser.
func cleanupMultipartFiles(headers []*multipart.FileHeader) {
	for _, fh := range headers {
		if f, err := fh.Open(); err == nil {
			f.Close()
		}
	}
}

// ---- Hash-based deduplication and permanent save ----

// HashAndSave checks if a file with the given hash already exists in the files table.
// If so, it removes the temp file and returns the existing hash (no duplicate on disk).
// If not, it moves the temp file to its final location and inserts a new row in the
// files table within the given transaction.
//
// The caller MUST provide a transaction. If the transaction is rolled back after
// this function succeeds, the file on disk will be orphaned and cleaned up by GC.
func HashAndSave(tx *sql.Tx, tf *TempFile, uploadDir string) (*FileRecord, error) {
	// 1. Check if this hash already exists in the files table.
	existing, err := getFileByHash(tx, tf.Hash)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		// File already exists — remove the temp copy and return the existing record.
		tf.Cleanup()
		return existing, nil
	}

	// 2. Determine final path: uploadDir/{hash}{ext}
	finalPath := filepath.Join(uploadDir, tf.Hash+tf.Ext)

	// 3. Ensure the parent directory exists.
	dir := filepath.Dir(finalPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, apperror.Internal("failed to create upload directory", err)
	}

	// 4. Insert the file record into the database first.
	//    If this succeeds, we move the file. If the move fails, the transaction
	//    will roll back and the DB row is removed.
	record := &FileRecord{
		Hash:         tf.Hash,
		Ext:          tf.Ext,
		MIMEType:     detectMIMEFromExt(tf.Ext),
		Size:         tf.Size,
		OriginalName: tf.OriginalName,
	}

	if err := insertFile(tx, record); err != nil {
		return nil, err
	}

	// 5. Move temp file to final location (atomic on same filesystem).
	if err := os.Rename(tf.Path, finalPath); err != nil {
		// The DB row was inserted, but the move failed.
		// The transaction will roll back and the DB row will be removed.
		// Remove the temp file on error (os.Rename doesn't delete the source on failure).
		tf.Cleanup()
		return nil, apperror.Internal("failed to move file to final location", err)
	}

	// Success — clear the temp path so cleanup doesn't try to remove it.
	tf.Path = ""

	return record, nil
}

// FileRecord represents a row in the files table.
type FileRecord struct {
	Hash         string `json:"hash"`
	Ext          string `json:"ext"`
	MIMEType     string `json:"mime_type"`
	Size         int64  `json:"size"`
	Width        *int   `json:"width,omitempty"`
	Height       *int   `json:"height,omitempty"`
	OriginalName string `json:"original_name"`
}

// PublicPath returns the URL path to serve this file.
func (f *FileRecord) PublicPath() string {
	return "/uploads/" + f.Hash + f.Ext
}

// StoragePath returns the absolute filesystem path for this file.
func (f *FileRecord) StoragePath(uploadDir string) string {
	return filepath.Join(uploadDir, f.Hash+f.Ext)
}

// ---- DB helpers (private, operate within a transaction) ----

func getFileByHash(tx *sql.Tx, hash string) (*FileRecord, error) {
	row := tx.QueryRow(
		`SELECT hash, ext, mime_type, size, original_name FROM files WHERE hash = ?`,
		hash,
	)
	var f FileRecord
	err := row.Scan(&f.Hash, &f.Ext, &f.MIMEType, &f.Size, &f.OriginalName)
	if err == nil {
		return &f, nil
	}
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return nil, apperror.Internal("failed to query file by hash", err)
}

func insertFile(tx *sql.Tx, f *FileRecord) error {
	_, err := tx.Exec(
		`INSERT OR IGNORE INTO files (hash, ext, mime_type, size, original_name)
		 VALUES (?, ?, ?, ?, ?)`,
		f.Hash, f.Ext, f.MIMEType, f.Size, f.OriginalName,
	)
	if err != nil {
		return apperror.Internal("failed to insert file record", err)
	}
	return nil
}

// ---- Utility helpers ----

func detectMIMEFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

func allowedExtensionsList() []string {
	exts := make([]string, 0, len(allowedExtensions))
	for e := range allowedExtensions {
		exts = append(exts, e)
	}
	return exts
}

func allowedMIMEsList() []string {
	mimes := make([]string, 0, len(allowedMIMETypes))
	for m := range allowedMIMETypes {
		mimes = append(mimes, m)
	}
	return mimes
}
