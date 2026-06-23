package handler

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"blog-api/internal/apperror"
	"blog-api/internal/store"
	"blog-api/internal/upload"

	"github.com/go-chi/chi/v5"
)

// ---- validation ----

// slugPattern matches kebab-case slugs: lowercase alphanumeric + hyphens, 1–100 chars.
var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func validateSlug(slug string) error {
	if slug == "" {
		return apperror.Validation("slug is required", nil)
	}
	if len(slug) > 100 {
		return apperror.Validation("slug must be at most 100 characters", map[string]any{"slug": slug})
	}
	if !slugPattern.MatchString(slug) {
		return apperror.Validation(
			"slug must be lowercase alphanumeric with hyphens (kebab-case)",
			map[string]any{"slug": slug},
		)
	}
	return nil
}

// ---- types ----

// BlogItem is the public-facing blog summary (without markdown content).
type BlogItem struct {
	Slug     string   `json:"slug"`
	Title    string   `json:"title"`
	Tags     []string `json:"tags"`
	Date     string   `json:"date"`
	Summary  string   `json:"summary"`
	Cover    string   `json:"cover"`
	Hidden   bool     `json:"hidden"`
	Category string   `json:"category"`
}

// BlogDetail includes the markdown content and related images.
type BlogDetail struct {
	BlogItem
	Content string   `json:"content"`
	Images  []string `json:"images"`
}

// BlogHandler handles blog CRUD endpoints.
type BlogHandler struct {
	store     *store.Store
	uploadDir string
	tempDir   string
}

// NewBlogHandler creates a BlogHandler.
func NewBlogHandler(s *store.Store, uploadDir string) *BlogHandler {
	return &BlogHandler{
		store:     s,
		uploadDir: uploadDir,
		tempDir:   uploadDir + "/tmp",
	}
}

// ---- GET /api/blogs ----

// List returns all non-deleted blogs, optionally filtered by category or tag.
func (h *BlogHandler) List(w http.ResponseWriter, r *http.Request) error {
	category := r.URL.Query().Get("category")
	tag := r.URL.Query().Get("tag")

	var rows *sql.Rows
	var err error

	switch {
	case category != "":
		rows, err = h.store.DB().QueryContext(r.Context(),
			`SELECT slug, title, date, summary, cover, hidden, category
			 FROM blogs WHERE deleted_at IS NULL AND category = ?
			 ORDER BY date DESC, sort_order ASC`, category,
		)
	case tag != "":
		rows, err = h.store.DB().QueryContext(r.Context(),
			`SELECT b.slug, b.title, b.date, b.summary, b.cover, b.hidden, b.category
			 FROM blogs b
			 INNER JOIN blog_tags bt ON bt.blog_slug = b.slug
			 WHERE b.deleted_at IS NULL AND bt.tag = ?
			 ORDER BY b.date DESC, b.sort_order ASC`, tag,
		)
	default:
		rows, err = h.store.DB().QueryContext(r.Context(),
			`SELECT slug, title, date, summary, cover, hidden, category
			 FROM blogs WHERE deleted_at IS NULL
			 ORDER BY date DESC, sort_order ASC`,
		)
	}
	if err != nil {
		return apperror.Internal("failed to query blogs", err)
	}
	defer rows.Close()

	items := make([]BlogItem, 0)
	for rows.Next() {
		var item BlogItem
		if scanErr := rows.Scan(&item.Slug, &item.Title, &item.Date, &item.Summary,
			&item.Cover, &item.Hidden, &item.Category); scanErr != nil {
			return apperror.Internal("failed to scan blog row", scanErr)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return apperror.Internal("failed to iterate blog rows", err)
	}

	// Populate tags for each blog.
	for i := range items {
		tags, tagErr := h.getTags(r.Context(), items[i].Slug)
		if tagErr != nil {
			return tagErr
		}
		items[i].Tags = tags
	}

	apperror.WriteSuccess(w, items)
	return nil
}

// ---- GET /api/blogs/{slug} ----

// Get returns a single blog with its markdown content.
func (h *BlogHandler) Get(w http.ResponseWriter, r *http.Request) error {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		return apperror.Validation("slug is required", nil)
	}

	row := h.store.DB().QueryRowContext(r.Context(),
		`SELECT slug, title, date, summary, cover, hidden, category, content_md
		 FROM blogs WHERE slug = ? AND deleted_at IS NULL`, slug,
	)

	var detail BlogDetail
	err := row.Scan(&detail.Slug, &detail.Title, &detail.Date, &detail.Summary,
		&detail.Cover, &detail.Hidden, &detail.Category, &detail.Content)
	if err == sql.ErrNoRows {
		return apperror.NotFound("blog not found: " + slug)
	}
	if err != nil {
		return apperror.Internal("failed to scan blog", err)
	}

	// Populate tags.
	tags, err := h.getTags(r.Context(), slug)
	if err != nil {
		return err
	}
	detail.Tags = tags

	// Collect image URLs.
	images, err := h.getBlogImagePaths(r.Context(), slug)
	if err != nil {
		return err
	}
	detail.Images = images

	apperror.WriteSuccess(w, detail)
	return nil
}

// ---- POST /api/blogs (create) ----

// Create handles multipart blog creation.
// Form fields: title, date, summary, category, content (markdown string)
// Form files: cover (single), images (multiple)
func (h *BlogHandler) Create(w http.ResponseWriter, r *http.Request) error {
	return h.createOrUpdate(w, r, "")
}

// ---- PUT /api/blogs/{slug} (update) ----

// Update handles multipart blog update.
func (h *BlogHandler) Update(w http.ResponseWriter, r *http.Request) error {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		return apperror.Validation("slug is required", nil)
	}
	return h.createOrUpdate(w, r, slug)
}

// ---- DELETE /api/blogs/{slug} ----

// Delete soft-deletes a blog and conditionally removes orphaned files.
func (h *BlogHandler) Delete(w http.ResponseWriter, r *http.Request) error {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		return apperror.Validation("slug is required", nil)
	}

	// Phase 1: Collect file hashes used exclusively by this blog.
	orphanHashes, err := h.collectExclusiveBlogFiles(r.Context(), slug)
	if err != nil {
		return err
	}

	// Phase 2: Transaction — delete junction rows and soft-delete the blog.
	err = h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		// Delete junction rows.
		if _, execErr := tx.Exec(`DELETE FROM blog_files WHERE blog_slug = ?`, slug); execErr != nil {
			return apperror.Internal("failed to delete blog file associations", execErr)
		}
		// Delete tags.
		if _, execErr := tx.Exec(`DELETE FROM blog_tags WHERE blog_slug = ?`, slug); execErr != nil {
			return apperror.Internal("failed to delete blog tags", execErr)
		}
		// Soft-delete the blog.
		result, execErr := tx.Exec(
			`UPDATE blogs SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE slug = ? AND deleted_at IS NULL`,
			slug,
		)
		if execErr != nil {
			return apperror.Internal("failed to soft-delete blog", execErr)
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			return apperror.NotFound("blog not found: " + slug)
		}

		// Delete exclusive file records from the files table.
		for _, hash := range orphanHashes {
			if _, execErr := tx.Exec(`DELETE FROM files WHERE hash = ?`, hash); execErr != nil {
				return apperror.Internal("failed to delete file record", execErr)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Phase 3: Remove files from disk (after successful commit).
	// Even if this step fails partially, periodic GC will eventually clean up.
	for _, hash := range orphanHashes {
		_ = removeFileByHash(h.uploadDir, hash)
	}

	apperror.WriteSuccess(w, map[string]string{"deleted": slug})
	return nil
}

// ---- private helpers ----

func (h *BlogHandler) createOrUpdate(w http.ResponseWriter, r *http.Request, existingSlug string) error {
	// 1. Parse multipart form.
	if err := r.ParseMultipartForm(upload.MaxTotalSize); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			return apperror.PayloadTooLarge("request body exceeds maximum size")
		}
		return apperror.Validation("failed to parse multipart form", map[string]any{"error": err.Error()})
	}

	// 2. Extract form fields.
	slug := strings.TrimSpace(r.FormValue("slug"))
	title := strings.TrimSpace(r.FormValue("title"))
	date := strings.TrimSpace(r.FormValue("date"))
	summary := strings.TrimSpace(r.FormValue("summary"))
	category := strings.TrimSpace(r.FormValue("category"))
	content := r.FormValue("content") // markdown body
	hiddenStr := r.FormValue("hidden")
	tagsStr := r.FormValue("tags") // comma-separated

	hidden := hiddenStr == "true" || hiddenStr == "1"

	if existingSlug != "" {
		slug = existingSlug
	}

	// Validate slug.
	if err := validateSlug(slug); err != nil {
		return err
	}

	// Validate content length.
	if len(content) > 1<<20 { // 1 MB
		return apperror.PayloadTooLarge("markdown content exceeds 1 MB limit")
	}

	// Parse tags.
	var tags []string
	if tagsStr != "" {
		for _, t := range strings.Split(tagsStr, ",") {
			trimmed := strings.TrimSpace(t)
			if trimmed != "" {
				tags = append(tags, trimmed)
			}
		}
	}

	// 3. Collect uploaded files.
	var tempFiles []*TempFileInfo

	// Cover image.
	if coverHeaders, ok := r.MultipartForm.File["cover"]; ok && len(coverHeaders) > 0 {
		tf, err := upload.ValidateFileHeader(coverHeaders[0], h.tempDir)
		if err != nil {
			upload.CleanupTempFiles(toUploadTempFiles(tempFiles))
			return err
		}
		tempFiles = append(tempFiles, &TempFileInfo{TempFile: tf, Kind: "cover"})
	}

	// Content images.
	if imgHeaders, ok := r.MultipartForm.File["images"]; ok {
		if len(imgHeaders) > upload.MaxFilesPerRequest {
			upload.CleanupTempFiles(toUploadTempFiles(tempFiles))
			return apperror.Validation(
				fmt.Sprintf("too many files: maximum %d per request", upload.MaxFilesPerRequest),
				nil,
			)
		}
		for _, fh := range imgHeaders {
			tf, err := upload.ValidateFileHeader(fh, h.tempDir)
			if err != nil {
				upload.CleanupTempFiles(toUploadTempFiles(tempFiles))
				return err
			}
			tempFiles = append(tempFiles, &TempFileInfo{TempFile: tf, Kind: "image"})
		}
	}

	// Defer cleanup in case of early return.
	var committed bool
	var finalPaths []string

	defer func() {
		if !committed {
			// Clean up temp files that weren't moved to final location.
			for _, ti := range tempFiles {
				ti.Cleanup()
			}
			// Clean up files that were moved but the transaction failed.
			for _, p := range finalPaths {
				osRemove(p)
			}
		}
	}()

	// 4. Transaction.
	err := h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		isNew := existingSlug == ""

		if isNew {
			// Check for duplicate slug.
			var count int
			if scanErr := tx.QueryRow(
				`SELECT COUNT(*) FROM blogs WHERE slug = ? AND deleted_at IS NULL`, slug,
			).Scan(&count); scanErr != nil {
				return apperror.Internal("failed to check slug uniqueness", scanErr)
			}
			if count > 0 {
				return apperror.Conflict("a blog with this slug already exists: " + slug)
			}

			// Reactivate a previously soft-deleted row.
			if _, execErr := tx.Exec(
				`DELETE FROM blogs WHERE slug = ? AND deleted_at IS NOT NULL`, slug,
			); execErr != nil {
				return apperror.Internal("failed to remove old soft-deleted slug", execErr)
			}
		}

		// Process uploaded files within the transaction.
		var coverPath string
		var imagePaths []string
		fileIndex := 0

		for _, ti := range tempFiles {
			record, saveErr := upload.HashAndSave(tx, ti.TempFile, h.uploadDir)
			if saveErr != nil {
				return saveErr
			}
			publicPath := record.PublicPath()

			// Insert blog_files junction row.
			isCover := 0
			if ti.Kind == "cover" {
				isCover = 1
				coverPath = publicPath
			}
			if _, execErr := tx.Exec(
				`INSERT OR IGNORE INTO blog_files (blog_slug, file_hash, is_cover, sort_order)
				 VALUES (?, ?, ?, ?)`, slug, record.Hash, isCover, fileIndex,
			); execErr != nil {
				return apperror.Internal("failed to insert blog file association", execErr)
			}
			finalPaths = append(finalPaths, record.StoragePath(h.uploadDir))
			imagePaths = append(imagePaths, publicPath)
			fileIndex++
		}

		// Handle external cover URL (if a URL was provided instead of a file).
		coverURL := strings.TrimSpace(r.FormValue("cover_url"))
		if coverPath == "" && coverURL != "" {
			coverPath = coverURL
		}

		if isNew {
			// INSERT
			_, execErr := tx.Exec(
				`INSERT INTO blogs (slug, title, date, summary, cover, content_md, hidden, category, sort_order)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
				slug, title, date, summary, coverPath, content, hidden, category,
			)
			if execErr != nil {
				return apperror.Internal("failed to insert blog", execErr)
			}
		} else {
			// UPDATE — only set fields that are provided.
			_, execErr := tx.Exec(
				`UPDATE blogs SET title = ?, date = ?, summary = ?, cover = ?,
				 content_md = ?, hidden = ?, category = ?,
				 updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
				 WHERE slug = ? AND deleted_at IS NULL`,
				title, date, summary, coverPath, content, hidden, category, slug,
			)
			if execErr != nil {
				return apperror.Internal("failed to update blog", execErr)
			}
		}

		// Replace tags: delete existing, insert new.
		if _, execErr := tx.Exec(`DELETE FROM blog_tags WHERE blog_slug = ?`, slug); execErr != nil {
			return apperror.Internal("failed to delete old tags", execErr)
		}
		for _, tag := range tags {
			if _, execErr := tx.Exec(
				`INSERT OR IGNORE INTO blog_tags (blog_slug, tag) VALUES (?, ?)`, slug, tag,
			); execErr != nil {
				return apperror.Internal("failed to insert tag", execErr)
			}
		}

		return nil
	})
	if err != nil {
		return err
	}

	committed = true
	apperror.WriteSuccess(w, map[string]string{"slug": slug})
	return nil
}

// ---- data helpers ----

func (h *BlogHandler) getTags(ctx context.Context, slug string) ([]string, error) {
	rows, err := h.store.DB().QueryContext(ctx,
		`SELECT tag FROM blog_tags WHERE blog_slug = ? ORDER BY tag`, slug,
	)
	if err != nil {
		return nil, apperror.Internal("failed to query tags", err)
	}
	defer rows.Close()

	tags := make([]string, 0)
	for rows.Next() {
		var t string
		if scanErr := rows.Scan(&t); scanErr != nil {
			return nil, apperror.Internal("failed to scan tag", scanErr)
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (h *BlogHandler) getBlogImagePaths(ctx context.Context, slug string) ([]string, error) {
	rows, err := h.store.DB().QueryContext(ctx,
		`SELECT f.hash, f.ext FROM files f
		 INNER JOIN blog_files bf ON bf.file_hash = f.hash
		 WHERE bf.blog_slug = ? ORDER BY bf.sort_order`, slug,
	)
	if err != nil {
		return nil, apperror.Internal("failed to query blog images", err)
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var hash, ext string
		if scanErr := rows.Scan(&hash, &ext); scanErr != nil {
			return nil, apperror.Internal("failed to scan file row", scanErr)
		}
		paths = append(paths, "/uploads/"+hash+ext)
	}
	return paths, rows.Err()
}

// collectExclusiveBlogFiles returns hashes of files that are ONLY referenced by the given blog.
func (h *BlogHandler) collectExclusiveBlogFiles(ctx context.Context, slug string) ([]string, error) {
	rows, err := h.store.DB().QueryContext(ctx,
		`SELECT bf.file_hash FROM blog_files bf WHERE bf.blog_slug = ?
		 AND NOT EXISTS (
		   SELECT 1 FROM blog_files bf2 WHERE bf2.file_hash = bf.file_hash AND bf2.blog_slug != ?
		 )`, slug, slug,
	)
	if err != nil {
		return nil, apperror.Internal("failed to query exclusive blog files", err)
	}
	defer rows.Close()

	var hashes []string
	for rows.Next() {
		var hash string
		if scanErr := rows.Scan(&hash); scanErr != nil {
			return nil, apperror.Internal("failed to scan hash", scanErr)
		}
		hashes = append(hashes, hash)
	}
	return hashes, rows.Err()
}

// ---- temp file tracking ----

// TempFileInfo wraps a TempFile with metadata about its purpose.
type TempFileInfo struct {
	*upload.TempFile
	Kind string // "cover" or "image"
}

func toUploadTempFiles(infos []*TempFileInfo) []*upload.TempFile {
	result := make([]*upload.TempFile, 0, len(infos))
	for _, ti := range infos {
		result = append(result, ti.TempFile)
	}
	return result
}

// ---- os helpers (shadowed for testability) ----

var osRemove = os.Remove

func removeFileByHash(uploadDir, hash string) error {
	// We don't know the extension without querying the database, but the hash
	// is the filename prefix. Attempt to find and remove.
	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), hash) {
			path := filepath.Join(uploadDir, entry.Name())
			if rmErr := os.Remove(path); rmErr != nil && !os.IsNotExist(rmErr) {
				return rmErr
			}
			return nil
		}
	}
	return nil
}
