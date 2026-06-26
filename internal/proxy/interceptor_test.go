package proxy

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"llm-benchmarker/internal/db"
)

func TestExtractPrompt(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		expected string
	}{
		{
			name:     "simple prompt",
			body:     []byte(`{"prompt": "Hello, world!"}`),
			expected: "Hello, world!",
		},
		{
			name:     "empty object",
			body:     []byte(`{}`),
			expected: "Intercepted Request",
		},
		{
			name:     "invalid JSON",
			body:     []byte(`not json`),
			expected: "Intercepted Request",
		},
		{
			name:     "empty body",
			body:     nil,
			expected: "Intercepted Request",
		},
		{
			name:     "prompt with other fields",
			body:     []byte(`{"model": "llama3", "prompt": "What is Go?", "stream": true}`),
			expected: "What is Go?",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractPrompt(tt.body)
			if result != tt.expected {
				t.Errorf("extractPrompt(%q) = %q, want %q", string(tt.body), result, tt.expected)
			}
		})
	}
}

func TestExtractPrompt_Truncation(t *testing.T) {
	longPrompt := string(make([]byte, 300))
	for i := range longPrompt {
		longPrompt = longPrompt[:i] + "a" + longPrompt[i+1:]
	}

	body := []byte(`{"prompt": "` + longPrompt + `"}`)
	result := extractPrompt(body)

	if len(result) > 203 {
		t.Errorf("expected truncated result <= 203 chars, got %d", len(result))
	}
}

func TestTrackingResponseWriter_TracksTokens(t *testing.T) {
	inner := httptest.NewRecorder()
	tracker := &trackingResponseWriter{
		ResponseWriter:    inner,
		startTime:         time.Now(),
		isInterceptTarget: true,
	}

	data := []byte("{\"response\": \"hello\"}\n{\"response\": \"world\"}\n")

	n, err := tracker.Write(data)
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}
	if n != len(data) {
		t.Errorf("expected %d bytes written, got %d", len(data), n)
	}
	if tracker.streamTokenCount != 2 {
		t.Errorf("expected 2 stream tokens (2 newlines), got %d", tracker.streamTokenCount)
	}
	if tracker.responseBytes != len(data) {
		t.Errorf("expected responseBytes %d, got %d", len(data), tracker.responseBytes)
	}
}

func TestTrackingResponseWriter_NoTokensForNonTarget(t *testing.T) {
	inner := httptest.NewRecorder()
	tracker := &trackingResponseWriter{
		ResponseWriter:    inner,
		startTime:         time.Now(),
		isInterceptTarget: false,
	}

	tracker.Write([]byte("hello\nworld\n"))
	if tracker.tokenCount() != 0 {
		t.Errorf("expected 0 tokens for non-target, got %d", tracker.tokenCount())
	}
	if tracker.responseBytes != 0 {
		t.Errorf("expected 0 responseBytes for non-target, got %d", tracker.responseBytes)
	}
}

func TestTrackingResponseWriter_FirstTokenTime(t *testing.T) {
	inner := httptest.NewRecorder()
	tracker := &trackingResponseWriter{
		ResponseWriter:    inner,
		startTime:         time.Now(),
		isInterceptTarget: true,
	}

	time.Sleep(1 * time.Millisecond)

	tracker.Write([]byte("first\n"))
	if tracker.firstTokenTime.IsZero() {
		t.Error("expected firstTokenTime to be set after first write")
	}

	firstTime := tracker.firstTokenTime
	tracker.Write([]byte("second\n"))
	if tracker.firstTokenTime != firstTime {
		t.Error("expected firstTokenTime to remain unchanged after subsequent writes")
	}
}

func TestTransparentProxy_NonInterceptPath(t *testing.T) {
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "ok"}`))
	}))
	defer targetServer.Close()

	database, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer database.Close()

	p, err := NewTransparentProxy(targetServer.URL, database)
	if err != nil {
		t.Fatalf("NewTransparentProxy failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/tags", nil)
	w := httptest.NewRecorder()
	p.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestExtractPromptLength(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		expected int
	}{
		{name: "simple prompt", body: []byte(`{"prompt": "hello"}`), expected: 5},
		{name: "empty prompt", body: []byte(`{"prompt": ""}`), expected: 0},
		{name: "empty object", body: []byte(`{}`), expected: 0},
		{name: "no body", body: nil, expected: 0},
		{name: "long prompt", body: []byte(`{"prompt": "aaaaaaaaaa"}`), expected: 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractPromptLength(tt.body)
			if result != tt.expected {
				t.Errorf("extractPromptLength(%q) = %d, want %d", string(tt.body), result, tt.expected)
			}
		})
	}
}

func TestExtractPrompt_HandlesModelField(t *testing.T) {
	body := []byte(`{"model": "llama3", "prompt": "test"}`)
	result := extractPrompt(body)
	if result != "test" {
		t.Errorf("expected 'test', got %q", result)
	}
}

func TestServeHTTP_ReadsRequestBody(t *testing.T) {
	targetServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("data\n"))
	}))
	defer targetServer.Close()

	database, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer database.Close()

	p, err := NewTransparentProxy(targetServer.URL, database)
	if err != nil {
		t.Fatalf("NewTransparentProxy failed: %v", err)
	}

	body := bytes.NewReader([]byte(`{"prompt": "Hello, world!"}`))
	req := httptest.NewRequest(http.MethodPost, "/api/generate", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	p.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}
