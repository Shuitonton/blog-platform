// Command server runs the blog-platform API server.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"blog-api/internal/apperror"
	"blog-api/internal/config"
	"blog-api/internal/handler"
	"blog-api/internal/middleware"
	"blog-api/internal/store"

	"github.com/go-chi/chi/v5"
)

func main() {
	// Load configuration.
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}

	// Setup structured logger.
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	slog.Info("starting server",
		"listen_addr", cfg.ListenAddr,
		"db_path", cfg.DBPath,
		"upload_dir", cfg.UploadDir,
	)

	// Open database + run migrations.
	ctx := context.Background()
	st, err := store.Open(ctx, cfg.DBPath)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer st.Close()

	// Clean temp directory on startup.
	handler.CleanTempDir(cfg.UploadDir + "/tmp")

	// Build handlers.
	authHandler := handler.NewAuthHandler(st, []byte(cfg.JWTSecret), cfg.InitialPassword, cfg.TokenExpiry, cfg.TurnstileSecret)
	blogHandler := handler.NewBlogHandler(st, cfg.UploadDir)
	simpleHandler := handler.NewSimpleHandler(st)
	uploadHandler := handler.NewUploadHandler(st, cfg.UploadDir)

	// Build router.
	r := chi.NewRouter()

	// Middleware stack (order matters — outermost first).
	r.Use(middleware.Recovery)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.CORS(cfg.CORSOrigins))

	// Public routes (no auth required).
	r.Get("/api/blogs", toHTTPHandler(blogHandler.List))
	r.Get("/api/blogs/{slug}", toHTTPHandler(blogHandler.Get))
	r.Get("/api/pictures", toHTTPHandler(simpleHandler.ListPictures))
	r.Get("/api/projects", toHTTPHandler(simpleHandler.ListProjects))
	r.Get("/api/bloggers", toHTTPHandler(simpleHandler.ListBloggers))
	r.Get("/api/shares", toHTTPHandler(simpleHandler.ListShares))
	r.Get("/api/about", toHTTPHandler(simpleHandler.GetAbout))
	r.Get("/api/snippets", toHTTPHandler(simpleHandler.ListSnippets))
	r.Get("/api/site-config", toHTTPHandler(simpleHandler.GetSiteConfig))
	r.Get("/api/card-styles", toHTTPHandler(simpleHandler.GetCardStyles))
	r.Get("/api/categories", toHTTPHandler(simpleHandler.ListCategories))

	// Static file serving for uploads.
	r.Handle("/uploads/*", handler.ServeStatic(cfg.UploadDir))

	// Auth routes (no auth required).
	r.With(middleware.RateLimit(10, time.Minute)).Post("/api/auth/login", toHTTPHandler(authHandler.Login))
	r.With(middleware.RateLimit(30, time.Minute)).Post("/api/verify-turnstile", toHTTPHandler(authHandler.VerifyTurnstile))

	// Protected routes (auth required).
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth([]byte(cfg.JWTSecret)))

		// Blogs.
		r.Post("/api/blogs", toHTTPHandler(blogHandler.Create))
		r.Put("/api/blogs/{slug}", toHTTPHandler(blogHandler.Update))
		r.Delete("/api/blogs/{slug}", toHTTPHandler(blogHandler.Delete))

		// Simple entities (full replace).
		r.Put("/api/pictures", toHTTPHandler(simpleHandler.SavePictures))
		r.Put("/api/projects", toHTTPHandler(simpleHandler.SaveProjects))
		r.Put("/api/bloggers", toHTTPHandler(simpleHandler.SaveBloggers))
		r.Put("/api/shares", toHTTPHandler(simpleHandler.SaveShares))
		r.Put("/api/about", toHTTPHandler(simpleHandler.SaveAbout))
		r.Put("/api/snippets", toHTTPHandler(simpleHandler.SaveSnippets))
		r.Put("/api/site-config", toHTTPHandler(simpleHandler.SaveSiteConfig))
		r.Put("/api/card-styles", toHTTPHandler(simpleHandler.SaveCardStyles))
		r.Put("/api/categories", toHTTPHandler(simpleHandler.SaveCategories))

		// File upload.
		r.Post("/api/upload", toHTTPHandler(uploadHandler.Upload))
	})

	// Health check.
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Create HTTP server.
	srv := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig.String())

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("server shutdown error", "error", err)
		}
	}()

	// Start serving.
	slog.Info("server listening", "addr", cfg.ListenAddr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}

	slog.Info("server stopped gracefully")
}

// toHTTPHandler converts a HandlerFunc (returns error) to an http.HandlerFunc.
// It ensures all errors are uniformly rendered as JSON error responses.
func toHTTPHandler(fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			apperror.WriteError(w, err)
		}
	}
}
