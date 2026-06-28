// Package apperror provides a unified error type for the entire application.
// Every handler and service function returns *AppError for known error conditions,
// ensuring consistent JSON error responses and proper HTTP status codes.
package apperror

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// ErrorCode is a machine-readable error identifier, stable across releases.
type ErrorCode string

const (
	ErrValidation       ErrorCode = "VALIDATION_ERROR"
	ErrUnauthorized     ErrorCode = "UNAUTHORIZED"
	ErrForbidden        ErrorCode = "FORBIDDEN"
	ErrNotFound         ErrorCode = "NOT_FOUND"
	ErrConflict         ErrorCode = "CONFLICT"
	ErrPayloadTooLarge  ErrorCode = "PAYLOAD_TOO_LARGE"
	ErrUnsupportedMedia ErrorCode = "UNSUPPORTED_MEDIA_TYPE"
	ErrRateLimited      ErrorCode = "RATE_LIMITED"
	ErrInternal         ErrorCode = "INTERNAL_ERROR"
)

// AppError is the canonical error type. It carries both machine-readable
// information for clients and an HTTP status code for the transport layer.
//
// The underlying error (Err) is never serialized to the client — it is
// logged server-side only, preventing information leakage.
type AppError struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
	Err     error          `json:"-"`
	Status  int            `json:"-"`
}

// Error implements the error interface.
func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Unwrap returns the underlying error for errors.Is / errors.As support.
func (e *AppError) Unwrap() error { return e.Err }

// StatusCodeToErrorCode maps common HTTP status codes to their error codes.
func StatusCodeToErrorCode(status int) ErrorCode {
	switch {
	case status == http.StatusBadRequest:
		return ErrValidation
	case status == http.StatusUnauthorized:
		return ErrUnauthorized
	case status == http.StatusForbidden:
		return ErrForbidden
	case status == http.StatusNotFound:
		return ErrNotFound
	case status == http.StatusConflict:
		return ErrConflict
	case status == http.StatusRequestEntityTooLarge:
		return ErrPayloadTooLarge
	case status == http.StatusUnsupportedMediaType:
		return ErrUnsupportedMedia
	case status == http.StatusTooManyRequests:
		return ErrRateLimited
	default:
		return ErrInternal
	}
}

// ---- Constructors ----

// Validation creates a 400 Bad Request error for input validation failures.
// details can carry per-field error messages (e.g. {"slug": "invalid format"}).
func Validation(msg string, details map[string]any) *AppError {
	return &AppError{
		Code:    ErrValidation,
		Message: msg,
		Details: details,
		Status:  http.StatusBadRequest,
	}
}

// NotFound creates a 404 Not Found error.
func NotFound(msg string) *AppError {
	return &AppError{
		Code:    ErrNotFound,
		Message: msg,
		Status:  http.StatusNotFound,
	}
}

// Unauthorized creates a 401 Unauthorized error.
func Unauthorized(msg string) *AppError {
	if msg == "" {
		msg = "authentication required"
	}
	return &AppError{
		Code:    ErrUnauthorized,
		Message: msg,
		Status:  http.StatusUnauthorized,
	}
}

// Forbidden creates a 403 Forbidden error.
func Forbidden(msg string) *AppError {
	if msg == "" {
		msg = "access denied"
	}
	return &AppError{
		Code:    ErrForbidden,
		Message: msg,
		Status:  http.StatusForbidden,
	}
}

// Conflict creates a 409 Conflict error (e.g. duplicate slug).
func Conflict(msg string) *AppError {
	return &AppError{
		Code:    ErrConflict,
		Message: msg,
		Status:  http.StatusConflict,
	}
}

// PayloadTooLarge creates a 413 error.
func PayloadTooLarge(msg string) *AppError {
	if msg == "" {
		msg = "request body too large"
	}
	return &AppError{
		Code:    ErrPayloadTooLarge,
		Message: msg,
		Status:  http.StatusRequestEntityTooLarge,
	}
}

// UnsupportedMedia creates a 415 error.
func UnsupportedMedia(msg string) *AppError {
	if msg == "" {
		msg = "unsupported media type"
	}
	return &AppError{
		Code:    ErrUnsupportedMedia,
		Message: msg,
		Status:  http.StatusUnsupportedMediaType,
	}
}

// TooManyRequests creates a 429 error.
func TooManyRequests(msg string) *AppError {
	if msg == "" {
		msg = "too many requests"
	}
	return &AppError{
		Code:    ErrRateLimited,
		Message: msg,
		Status:  http.StatusTooManyRequests,
	}
}

// Internal creates a 500 Internal Server Error.
// The underlying error is logged but never exposed to the client.
func Internal(msg string, err error) *AppError {
	return &AppError{
		Code:    ErrInternal,
		Message: msg,
		Err:     err,
		Status:  http.StatusInternalServerError,
	}
}

// Wrap wraps an arbitrary error. If it's already an *AppError, it's returned
// unchanged. Otherwise, it becomes an Internal error with the provided message.
func Wrap(err error, msg string) *AppError {
	if err == nil {
		return nil
	}
	if appErr, ok := err.(*AppError); ok {
		return appErr
	}
	return Internal(msg, err)
}

// ---- Response helpers ----

// ErrorResponse is the JSON shape returned to clients on errors.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody is the content of the "error" field in error responses.
type ErrorBody struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// dataResponse is the JSON shape returned to clients on success.
type dataResponse struct {
	Data any `json:"data"`
}

// WriteJSON writes v as a JSON response with the given HTTP status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Encoding failed — this is unrecoverable at this point since
		// the status header is already written. Log and move on.
		// In practice this only fails on marshal errors which shouldn't
		// happen with our well-typed data structures.
	}
}

// WriteSuccess writes a 200 OK with {"data": v}.
func WriteSuccess(w http.ResponseWriter, data any) {
	WriteJSON(w, http.StatusOK, dataResponse{Data: data})
}

// WriteError writes an *AppError as a JSON error response.
// Unknown errors are converted to 500 Internal errors.
func WriteError(w http.ResponseWriter, err error) {
	appErr, ok := err.(*AppError)
	if !ok {
		appErr = Internal("an unexpected error occurred", err)
	}
	WriteJSON(w, appErr.Status, ErrorResponse{
		Error: ErrorBody{
			Code:    appErr.Code,
			Message: appErr.Message,
			Details: appErr.Details,
		},
	})
}
