// Package store provides database connectivity, migration, and transaction support.
// It uses modernc.org/sqlite (pure Go, no CGo) for fully static builds.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

func Open(ctx context.Context, dbPath string) (*Store, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("store: create data dir %s: %w", dir, err)
	}
	dsn := dbPath + "?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}
	db.SetMaxOpenConns(1); db.SetMaxIdleConns(1); db.SetConnMaxLifetime(0)
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: migrate: %w", err)
	}
	slog.Info("database opened", "path", dbPath, "mode", "WAL")
	return s, nil
}

func (s *Store) DB() *sql.DB       { return s.db }
func (s *Store) Close() error       { slog.Info("closing database"); return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	// Create tables if they don't exist. Existing data is preserved.
	// Schema changes require manual migration (ALTER TABLE) or a migration tool.
	migrations := []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA foreign_keys=ON`,

		// Settings (JSON singleton)
		`CREATE TABLE IF NOT EXISTS about (id INTEGER PRIMARY KEY CHECK(id=1), title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
		`CREATE TABLE IF NOT EXISTS site_config (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
		`CREATE TABLE IF NOT EXISTS card_styles (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
		`CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL DEFAULT '')`,

		// Blogs
		`CREATE TABLE IF NOT EXISTS blogs (slug TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', content_md TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), deleted_at TEXT)`,
		`CREATE TABLE IF NOT EXISTS blog_tags (blog_slug TEXT NOT NULL REFERENCES blogs(slug) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY(blog_slug, tag))`,
		`CREATE INDEX IF NOT EXISTS idx_blog_tags_tag ON blog_tags(tag)`,
		`CREATE INDEX IF NOT EXISTS idx_blogs_category ON blogs(category) WHERE deleted_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_blogs_date ON blogs(date) WHERE deleted_at IS NULL`,

		// Files
		`CREATE TABLE IF NOT EXISTS files (hash TEXT PRIMARY KEY, ext TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0, original_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
		`CREATE TABLE IF NOT EXISTS blog_files (blog_slug TEXT NOT NULL REFERENCES blogs(slug) ON DELETE CASCADE, file_hash TEXT NOT NULL REFERENCES files(hash), is_cover INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(blog_slug, file_hash))`,

		// Categories
		`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0)`,

		// Snippets
		`CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,

		// Orphan tracking
		`CREATE TABLE IF NOT EXISTS orphaned_files (file_hash TEXT PRIMARY KEY REFERENCES files(hash), marked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,

		// --- JSON-list tables (projects / bloggers / shares / pictures) ---

		`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, url TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), deleted_at TEXT)`,

		`CREATE TABLE IF NOT EXISTS bloggers (id TEXT PRIMARY KEY, url TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), deleted_at TEXT)`,

		`CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, url TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), deleted_at TEXT)`,

		`CREATE TABLE IF NOT EXISTS pictures (id TEXT PRIMARY KEY, url TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), deleted_at TEXT)`,
	}

	for _, m := range migrations {
		if _, err := s.db.ExecContext(ctx, m); err != nil {
			return fmt.Errorf("migration: %s: %w", m[:min(len(m), 60)], err)
		}
	}

	seeds := []string{
		`INSERT OR IGNORE INTO about (id, title, description, content) VALUES (1, '', '', '')`,
		`INSERT OR IGNORE INTO site_config (id, data) VALUES (1, '{}')`,
		`INSERT OR IGNORE INTO card_styles (id, data) VALUES (1, '{}')`,
	}
	for _, seed := range seeds {
		if _, err := s.db.ExecContext(ctx, seed); err != nil {
			return fmt.Errorf("seed: %w", err)
		}
	}
	return nil
}
