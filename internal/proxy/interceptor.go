package proxy

import (
	"bytes"
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
	bodyBuf            bytes.Buffer
	isInterceptTarget  bool
}

func (w *trackingResponseWriter) Write(b []byte) (int, error) {
	if w.isInterceptTarget && w.firstTokenTime.IsZero() {
		w.firstTokenTime = time.Now()
	}

	if w.isInterceptTarget {
		// A simple heuristic for token counting on streaming endpoints is counting the newlines
		// Since each chunk is a newline separated JSON object or SSE data event.
		w.tokenCount += bytes.Count(b, []byte("\n"))
		
		// Optionally buffer a portion of the body to extract the prompt/model if needed,
		// but typically we'd extract that from the Request, not the Response.
	}

	return w.ResponseWriter.Write(b)
}

func (p *TransparentProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Support dynamic routing if a specific provider is requested by the UI
	targetHost := p.TargetURL
	if customTarget := r.Header.Get("X-Target-Provider"); customTarget != "" {
		if parsed, err := url.Parse(customTarget); err == nil {
			targetHost = parsed
		}
	}
	
	// Create a dynamic reverse proxy for this specific request
	rp := httputil.NewSingleHostReverseProxy(targetHost)

	// Check if this is a generation endpoint we want to intercept
	isTarget := strings.Contains(r.URL.Path, "/generate") || strings.Contains(r.URL.Path, "/chat") || strings.Contains(r.URL.Path, "/completions") || strings.Contains(r.URL.Path, "/embeddings")
	
	// If it is, we need to read the request body to get the prompt and model
	// We'd have to tee the request body. For simplicity, we just track the URL and assume streaming token counts.
	// But let's log it.
	
	tracker := &trackingResponseWriter{
		ResponseWriter:    w,
		startTime:         time.Now(),
		isInterceptTarget: isTarget,
	}

	// Forward the request via standard ReverseProxy
	rp.ServeHTTP(tracker, r)

	// Post-request telemetry saving
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
			"Intercepted Request", // We could tee the r.Body to get the actual prompt
			r.URL.Path,
			targetHost.String(),
			tps,
			ttftNs,
			0, // Network RTT is harder to isolate purely from ReverseProxy without pre-flight pings
			tracker.tokenCount,
		)
		if err != nil {
			log.Printf("Failed to save intercepted telemetry: %v", err)
		} else {
			log.Printf("Intercepted %s: %d tokens at %.2f TPS (TTFT: %dms)", r.URL.Path, tracker.tokenCount, tps, ttftNs/1_000_000)
		}
	}
}
