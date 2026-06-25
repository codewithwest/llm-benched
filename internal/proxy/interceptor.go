package proxy

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"llm-benchmarker/internal/db"
)

type TransparentProxy struct {
	TargetURL *url.URL
	DB        *db.Database
	ReverseProxy *httputil.ReverseProxy
}

func NewTransparentProxy(targetURL string, database *db.Database) (*TransparentProxy, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(parsedURL)

	return &TransparentProxy{
		TargetURL:    parsedURL,
		DB:           database,
		ReverseProxy: proxy,
	}, nil
}

type trackingResponseWriter struct {
	http.ResponseWriter
	startTime          time.Time
	firstTokenTime     time.Time
	tokenCount         int
	responseBytes      int
	isInterceptTarget  bool
}

func (w *trackingResponseWriter) Write(b []byte) (int, error) {
	if w.isInterceptTarget && w.firstTokenTime.IsZero() {
		w.firstTokenTime = time.Now()
	}

	if w.isInterceptTarget {
		w.tokenCount += bytes.Count(b, []byte("\n"))
		w.responseBytes += len(b)
	}

	return w.ResponseWriter.Write(b)
}

func (p *TransparentProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	targetHost := p.TargetURL
	if customTarget := r.Header.Get("X-Target-Provider"); customTarget != "" {
		if parsed, err := url.Parse(customTarget); err == nil {
			targetHost = parsed
		}
	}

	isTarget := strings.Contains(r.URL.Path, "/generate") || strings.Contains(r.URL.Path, "/chat") || strings.Contains(r.URL.Path, "/completions") || strings.Contains(r.URL.Path, "/embeddings")

	log.Printf("Proxy: %s %s (intercept=%v)", r.Method, r.URL.Path, isTarget)

	var prompt string
	var promptLength int
	if isTarget && r.Body != nil {
		body, err := io.ReadAll(r.Body)
		r.Body.Close()
		if err == nil {
			prompt = extractPrompt(body)
			promptLength = extractPromptLength(body)
			r.Body = io.NopCloser(bytes.NewReader(body))
		}
	}

	rp := httputil.NewSingleHostReverseProxy(targetHost)
	rp.FlushInterval = 50 * time.Millisecond

	tracker := &trackingResponseWriter{
		ResponseWriter:    w,
		startTime:         time.Now(),
		isInterceptTarget: isTarget,
	}

	rp.ServeHTTP(tracker, r)

	log.Printf("Proxy done: %s (tokens=%d, target=%v)", r.URL.Path, tracker.tokenCount, isTarget)

	if isTarget && tracker.tokenCount > 0 {
		endTime := time.Now()
		elapsed := endTime.Sub(tracker.startTime)

		var ttftNs int64
		if !tracker.firstTokenTime.IsZero() {
			ttftNs = tracker.firstTokenTime.Sub(tracker.startTime).Nanoseconds()
		}

		tps := 0.0
		if elapsed.Seconds() > 0 {
			tps = float64(tracker.tokenCount) / elapsed.Seconds()
		}

		err := p.DB.SaveBenchmark(
			prompt,
			r.URL.Path,
			targetHost.String(),
			tps,
			ttftNs,
			0,
			tracker.tokenCount,
			promptLength,
			tracker.responseBytes,
		)
		if err != nil {
			log.Printf("Failed to save intercepted telemetry: %v", err)
		} else {
			log.Printf("Intercepted %s: %d tokens at %.2f TPS (TTFT: %dms)", r.URL.Path, tracker.tokenCount, tps, ttftNs/1_000_000)
		}
	}
}

func extractPrompt(body []byte) string {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		return "Intercepted Request"
	}
	if req.Prompt == "" {
		return "Intercepted Request"
	}
	if len(req.Prompt) > 200 {
		return req.Prompt[:200] + "..."
	}
	return req.Prompt
}

func extractPromptLength(body []byte) int {
	var req struct {
		Prompt string `json:"prompt"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		return 0
	}
	return len(req.Prompt)
}
