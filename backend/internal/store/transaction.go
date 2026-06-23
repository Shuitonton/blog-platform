package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"runtime/debug"

	"blog-api/internal/apperror"
)

// WithTx executes fn within a database transaction.
//
// Guarantees:
//   - If fn returns an error, the transaction is rolled back.
//   - If fn panics, the transaction is rolled back and the panic is re-thrown.
//   - Commit errors are surfaced as Internal errors.
//
// The function fn receives the transaction handle. It should NOT call
// Commit or Rollback on the transaction — WithTx handles that.
func (s *Store) WithTx(ctx context.Context, fn func(tx *sql.Tx) error) (err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return apperror.Internal("failed to begin transaction", err)
	}

	// Track whether a panic occurred so we can re-panic after rollback.
	var panicked bool

	defer func() {
		if r := recover(); r != nil {
			panicked = true
			// Best-effort rollback; ignore error since we're panicking.
			if rbErr := tx.Rollback(); rbErr != nil {
				slog.Error("tx rollback after panic failed",
					"rollback_err", rbErr,
					"panic", fmt.Sprintf("%v", r),
					"stack", string(debug.Stack()),
				)
			}
			panic(r)
		}

		// If fn returned an error, roll back.
		if err != nil && !panicked {
			if rbErr := tx.Rollback(); rbErr != nil {
				slog.Error("tx rollback failed",
					"rollback_err", rbErr,
					"original_err", err,
				)
				// Return the original error — it's more meaningful to the caller.
			}
			return
		}

		// Normal success path: commit.
		if !panicked {
			if commitErr := tx.Commit(); commitErr != nil {
				err = apperror.Internal("failed to commit transaction", commitErr)
			}
		}
	}()

	err = fn(tx)
	return err
}
