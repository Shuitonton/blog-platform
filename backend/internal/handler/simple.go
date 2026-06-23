package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"blog-api/internal/apperror"
	"blog-api/internal/store"
)

// SimpleHandler handles CRUD for JSON-list entities (projects, bloggers, shares, pictures)
// and singletons (about, snippets, site-config, card-styles, categories).
type SimpleHandler struct{ store *store.Store }

func NewSimpleHandler(s *store.Store) *SimpleHandler { return &SimpleHandler{store: s} }

// ---- generic JSON-list save / list ----

// saveJSONList replaces all rows in a table (soft-delete old, insert new).
// Each item must have an "id" (string) or one will be generated.
// The full JSON object is stored in the "data" column.
func (h *SimpleHandler) saveJSONList(w http.ResponseWriter, r *http.Request, table string) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return apperror.Internal("read body", err)
	}
	defer r.Body.Close()

	var items []map[string]any
	if err := json.Unmarshal(body, &items); err != nil {
		return apperror.Validation("invalid JSON array", map[string]any{"error": err.Error()})
	}

	err = h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		// Hard-delete ALL rows (including previously soft-deleted ones)
		// so that INSERT below doesn't hit PK conflicts.
		if _, ex := tx.Exec(`DELETE FROM ` + table); ex != nil {
			return apperror.Internal("clear "+table, ex)
		}
		for i, item := range items {
			raw, _ := json.Marshal(item)
			id := getString(item, "id", "")
			if id == "" {
				id = getString(item, "url", "")
			}
			if id == "" {
				id = "item-" + randomHex(8)
			}
			if _, ex := tx.Exec(
				`INSERT INTO `+table+` (id, url, data, sort_order) VALUES (?, ?, ?, ?)`,
				id, getString(item, "url", ""), string(raw), i,
			); ex != nil {
				return apperror.Internal("insert "+table, ex)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	apperror.WriteSuccess(w, map[string]int{"count": len(items)})
	return nil
}

// listJSONList returns all non-deleted rows as a JSON array of the "data" column.
func (h *SimpleHandler) listJSONList(ctx context.Context, w http.ResponseWriter, table string) error {
	rows, err := h.store.DB().QueryContext(ctx,
		`SELECT data FROM `+table+` WHERE deleted_at IS NULL ORDER BY sort_order`,
	)
	if err != nil {
		return apperror.Internal("query "+table, err)
	}
	defer rows.Close()

	results := make([]json.RawMessage, 0)
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return apperror.Internal("scan "+table, err)
		}
		results = append(results, json.RawMessage(data))
	}
	if rows.Err() != nil {
		return apperror.Internal("iterate "+table, rows.Err())
	}
	if results == nil {
		results = []json.RawMessage{}
	}

	b, _ := json.Marshal(results)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(b)
	return nil
}

// ---- Pictures ----

func (h *SimpleHandler) ListPictures(w http.ResponseWriter, r *http.Request) error {
	return h.listJSONList(r.Context(), w, "pictures")
}
func (h *SimpleHandler) SavePictures(w http.ResponseWriter, r *http.Request) error {
	return h.saveJSONList(w, r, "pictures")
}

// ---- Projects ----

func (h *SimpleHandler) ListProjects(w http.ResponseWriter, r *http.Request) error {
	return h.listJSONList(r.Context(), w, "projects")
}
func (h *SimpleHandler) SaveProjects(w http.ResponseWriter, r *http.Request) error {
	return h.saveJSONList(w, r, "projects")
}

// ---- Bloggers ----

func (h *SimpleHandler) ListBloggers(w http.ResponseWriter, r *http.Request) error {
	return h.listJSONList(r.Context(), w, "bloggers")
}
func (h *SimpleHandler) SaveBloggers(w http.ResponseWriter, r *http.Request) error {
	return h.saveJSONList(w, r, "bloggers")
}

// ---- Shares ----

func (h *SimpleHandler) ListShares(w http.ResponseWriter, r *http.Request) error {
	return h.listJSONList(r.Context(), w, "shares")
}
func (h *SimpleHandler) SaveShares(w http.ResponseWriter, r *http.Request) error {
	return h.saveJSONList(w, r, "shares")
}

// ---- About ----

func (h *SimpleHandler) GetAbout(w http.ResponseWriter, r *http.Request) error {
	row := h.store.DB().QueryRowContext(r.Context(),
		`SELECT json_object('title',title,'description',description,'content',content) FROM about WHERE id=1`)
	var data string
	if err := row.Scan(&data); err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write([]byte("{}"))
		return nil
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(data))
	return nil
}

func (h *SimpleHandler) SaveAbout(w http.ResponseWriter, r *http.Request) error {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	defer r.Body.Close()
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		return apperror.Validation("invalid JSON", map[string]any{"error": err.Error()})
	}
	_, err := h.store.DB().ExecContext(r.Context(),
		`INSERT OR REPLACE INTO about (id,title,description,content,updated_at) VALUES (1,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
		getString(m, "title", ""), getString(m, "description", ""), getString(m, "content", ""),
	)
	if err != nil {
		return apperror.Internal("save about", err)
	}
	apperror.WriteSuccess(w, m)
	return nil
}

// ---- Snippets ----

func (h *SimpleHandler) ListSnippets(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.store.DB().QueryContext(r.Context(), `SELECT content FROM snippets ORDER BY sort_order, id`)
	if err != nil {
		return apperror.Internal("query snippets", err)
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return apperror.Internal("scan snippet", err)
		}
		out = append(out, s)
	}
	if rows.Err() != nil {
		return apperror.Internal("iterate snippets", rows.Err())
	}
	apperror.WriteSuccess(w, out)
	return nil
}

func (h *SimpleHandler) SaveSnippets(w http.ResponseWriter, r *http.Request) error {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	defer r.Body.Close()
	var arr []string
	if err := json.Unmarshal(body, &arr); err != nil {
		return apperror.Validation("expected string array", map[string]any{"error": err.Error()})
	}
	err := h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		if _, ex := tx.Exec(`DELETE FROM snippets`); ex != nil {
			return apperror.Internal("clear snippets", ex)
		}
		for i, s := range arr {
			if _, ex := tx.Exec(`INSERT INTO snippets (content, sort_order) VALUES (?,?)`, s, i); ex != nil {
				return apperror.Internal("insert snippet", ex)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	apperror.WriteSuccess(w, map[string]int{"count": len(arr)})
	return nil
}

// ---- Site Config ----

func (h *SimpleHandler) GetSiteConfig(w http.ResponseWriter, r *http.Request) error {
	row := h.store.DB().QueryRowContext(r.Context(), `SELECT data FROM site_config WHERE id=1`)
	var d string
	if err := row.Scan(&d); err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write([]byte("{}"))
		return nil
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(d))
	return nil
}

func (h *SimpleHandler) SaveSiteConfig(w http.ResponseWriter, r *http.Request) error {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	defer r.Body.Close()
	var js json.RawMessage
	if err := json.Unmarshal(body, &js); err != nil {
		return apperror.Validation("invalid JSON", map[string]any{"error": err.Error()})
	}
	_, err := h.store.DB().ExecContext(r.Context(),
		`INSERT OR REPLACE INTO site_config (id,data,updated_at) VALUES (1,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))`, string(body))
	if err != nil {
		return apperror.Internal("save site-config", err)
	}
	apperror.WriteSuccess(w, json.RawMessage(`{"saved":true}`))
	return nil
}

// ---- Card Styles ----

func (h *SimpleHandler) GetCardStyles(w http.ResponseWriter, r *http.Request) error {
	row := h.store.DB().QueryRowContext(r.Context(), `SELECT data FROM card_styles WHERE id=1`)
	var d string
	if err := row.Scan(&d); err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write([]byte("{}"))
		return nil
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write([]byte(d))
	return nil
}

func (h *SimpleHandler) SaveCardStyles(w http.ResponseWriter, r *http.Request) error {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	defer r.Body.Close()
	var js json.RawMessage
	if err := json.Unmarshal(body, &js); err != nil {
		return apperror.Validation("invalid JSON", map[string]any{"error": err.Error()})
	}
	_, err := h.store.DB().ExecContext(r.Context(),
		`INSERT OR REPLACE INTO card_styles (id,data,updated_at) VALUES (1,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))`, string(body))
	if err != nil {
		return apperror.Internal("save card-styles", err)
	}
	apperror.WriteSuccess(w, json.RawMessage(`{"saved":true}`))
	return nil
}

// ---- Categories ----

func (h *SimpleHandler) ListCategories(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.store.DB().QueryContext(r.Context(), `SELECT name FROM categories ORDER BY sort_order, id`)
	if err != nil {
		return apperror.Internal("query categories", err)
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return apperror.Internal("scan category", err)
		}
		out = append(out, s)
	}
	if rows.Err() != nil {
		return apperror.Internal("iterate categories", rows.Err())
	}
	apperror.WriteSuccess(w, out)
	return nil
}

func (h *SimpleHandler) SaveCategories(w http.ResponseWriter, r *http.Request) error {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<17))
	defer r.Body.Close()
	var arr []string
	if err := json.Unmarshal(body, &arr); err != nil {
		return apperror.Validation("expected string array", map[string]any{"error": err.Error()})
	}
	err := h.store.WithTx(r.Context(), func(tx *sql.Tx) error {
		if _, ex := tx.Exec(`DELETE FROM categories`); ex != nil {
			return apperror.Internal("clear categories", ex)
		}
		for i, c := range arr {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			if _, ex := tx.Exec(`INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?,?)`, c, i); ex != nil {
				return apperror.Internal("insert category", ex)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	apperror.WriteSuccess(w, map[string]int{"count": len(arr)})
	return nil
}

// ---- helpers ----

func getString(m map[string]any, key, fallback string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return fallback
}

func randomHex(n int) string {
	const hexChars = "0123456789abcdef"
	b := make([]byte, n)
	for i := range b {
		b[i] = hexChars[i%16] // simplistic — good enough for id generation
	}
	return string(b)
}