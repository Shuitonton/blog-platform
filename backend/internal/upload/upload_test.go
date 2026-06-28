package upload

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"testing"
)

func TestValidateFileHeaderRejectsSVG(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "bad.svg")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, "/upload", &body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(1024); err != nil {
		t.Fatalf("parse multipart: %v", err)
	}

	_, err = ValidateFileHeader(req.MultipartForm.File["file"][0], t.TempDir())
	if err == nil {
		t.Fatal("expected svg upload to be rejected")
	}
}
