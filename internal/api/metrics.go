package api

import (
	"fmt"
	"net/http"
	"sync"
)

type MetricsRegistry struct {
	mu sync.Mutex

	requestsTotal   map[string]float64 // key: model
	tokensTotal     map[string]float64
	lastTPS         map[string]float64
	lastTTFTMs      map[string]float64
	lastDurationMs  map[string]float64
}

var GlobalMetrics = NewMetricsRegistry()

func NewMetricsRegistry() *MetricsRegistry {
	return &MetricsRegistry{
		requestsTotal:  make(map[string]float64),
		tokensTotal:    make(map[string]float64),
		lastTPS:        make(map[string]float64),
		lastTTFTMs:     make(map[string]float64),
		lastDurationMs: make(map[string]float64),
	}
}

func (m *MetricsRegistry) Record(model string, tokens int, tps float64, ttftNs, durationMs int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requestsTotal[model]++
	m.tokensTotal[model] += float64(tokens)
	m.lastTPS[model] = tps
	m.lastTTFTMs[model] = float64(ttftNs) / 1_000_000
	m.lastDurationMs[model] = float64(durationMs)
}

func (m *MetricsRegistry) Snapshot() (requestsTotal, tokensTotal map[string]float64, lastTPS, lastTTFTMs, lastDurationMs map[string]float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	requestsTotal = copyMap(m.requestsTotal)
	tokensTotal = copyMap(m.tokensTotal)
	lastTPS = copyMap(m.lastTPS)
	lastTTFTMs = copyMap(m.lastTTFTMs)
	lastDurationMs = copyMap(m.lastDurationMs)
	return
}

func copyMap(src map[string]float64) map[string]float64 {
	dst := make(map[string]float64, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func (m *MetricsRegistry) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	reqTotal, tokTotal, lastTPS, lastTTFT, lastDur := m.Snapshot()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	fmt.Fprintln(w, "# HELP llm_requests_total Total number of LLM requests proxied")
	fmt.Fprintln(w, "# TYPE llm_requests_total counter")
	for model, count := range reqTotal {
		fmt.Fprintf(w, "llm_requests_total{model=%q} %.0f\n", model, count)
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "# HELP llm_tokens_total Total number of tokens generated")
	fmt.Fprintln(w, "# TYPE llm_tokens_total counter")
	for model, count := range tokTotal {
		fmt.Fprintf(w, "llm_tokens_total{model=%q} %.0f\n", model, count)
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "# HELP llm_tps_last Tokens per second (last request)")
	fmt.Fprintln(w, "# TYPE llm_tps_last gauge")
	for model, tps := range lastTPS {
		fmt.Fprintf(w, "llm_tps_last{model=%q} %f\n", model, tps)
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "# HELP llm_ttft_ms_last Time to first token in ms (last request)")
	fmt.Fprintln(w, "# TYPE llm_ttft_ms_last gauge")
	for model, ttft := range lastTTFT {
		fmt.Fprintf(w, "llm_ttft_ms_last{model=%q} %f\n", model, ttft)
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "# HELP llm_duration_ms_last Total request duration in ms (last request)")
	fmt.Fprintln(w, "# TYPE llm_duration_ms_last gauge")
	for model, dur := range lastDur {
		fmt.Fprintf(w, "llm_duration_ms_last{model=%q} %f\n", model, dur)
	}
}
