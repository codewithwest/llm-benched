package ws

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// Frame represents the structural payload sent to the UI overlay.
type Frame struct {
	Type         string  `json:"type"`                     // "token", "metrics", "error", "done"
	Content      string  `json:"content,omitempty"`        // The generated token chunk
	TPS          float64 `json:"tps,omitempty"`            // Tokens per second
	TTFTNs       int64   `json:"ttft_ns,omitempty"`        // True Time To First Token
	ObservedTTFT int64   `json:"observed_ttft_ns,omitempty"`
	NetworkRTTNs int64   `json:"network_rtt_ns,omitempty"` // Baseline network latency
	TotalTokens  int     `json:"total_tokens,omitempty"`
	Error        string  `json:"error,omitempty"`
}

// ClientRequest represents an incoming command payload from the UI.
type ClientRequest struct {
	Endpoint string          `json:"endpoint"` // e.g., "/api/generate"
	Payload  json.RawMessage `json:"payload"`  // e.g., {"model": "llama3", "prompt": "Hello"}
}

// ProxyHandler encapsulates the WebSocket upgrade and remote target routing.
type ProxyHandler struct {
	TargetURL *url.URL
	Client    *http.Client
	DB        DBLogger
}

// DBLogger defines the persistence interface
type DBLogger interface {
	SaveBenchmark(prompt, endpoint string, tps float64, ttftNs, rttNs int64, totalTokens int) error
}

// NewProxyHandler initializes the engine proxy accepting a fully qualified network URL
// to target remote nodes on the local network, isolating networking transport latency
// from raw token generation time.
func NewProxyHandler(targetURL string, db DBLogger) (*ProxyHandler, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}
	return &ProxyHandler{
		TargetURL: parsedURL,
		Client: &http.Client{
			Timeout: 10 * time.Second, // Timeout for the baseline RTT ping
		},
		DB: db,
	}, nil
}

// MeasureNetworkRTT fires a lightweight HEAD request to the remote endpoint's base path
// to sample baseline network latency.
func (h *ProxyHandler) MeasureNetworkRTT(ctx context.Context) time.Duration {
	start := time.Now()
	
	// We hit the base path to just sample network round trip time
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, h.TargetURL.String(), nil)
	if err != nil {
		return 0
	}
	
	resp, err := h.Client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		return time.Since(start)
	}
	
	return 0
}

// HandleConnection upgrades the incoming connection and manages the full-duplex stream.
func (h *ProxyHandler) HandleConnection(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow for local cross-origin connections
	})
	if err != nil {
		http.Error(w, "WebSocket Upgrade Failed", http.StatusInternalServerError)
		return
	}
	defer c.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Wait for the client to send the initialization structural payload
	var req ClientRequest
	if err := wsjson.Read(ctx, c, &req); err != nil {
		h.sendError(ctx, c, "Failed to parse structural payload")
		return
	}

	// 1. Sample the baseline network RTT before initiating the generation request
	networkRTT := h.MeasureNetworkRTT(ctx)

	// 2. Prepare the upstream request targeting the distributed engine
	upstreamURL := h.TargetURL.ResolveReference(&url.URL{Path: req.Endpoint})
	upstreamReq, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL.String(), bytes.NewReader(req.Payload))
	if err != nil {
		h.sendError(ctx, c, "Failed to create upstream request")
		return
	}
	upstreamReq.Header.Set("Content-Type", "application/json")
	upstreamReq.Header.Set("X-Forwarded-Host", r.Header.Get("Host"))
	upstreamReq.Host = h.TargetURL.Host

	// Use default transport for streams (no timeout to allow long inference generation)
	httpClient := &http.Client{}
	
	startTime := time.Now()
	resp, err := httpClient.Do(upstreamReq)
	if err != nil {
		h.sendError(ctx, c, "Upstream connection failed: " + err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		h.sendError(ctx, c, "Upstream returned non-OK status")
		return
	}

	decoder := json.NewDecoder(resp.Body)
	
	var (
		firstTokenReceived bool
		observedTTFT       time.Duration
		trueTTFT           time.Duration
		tokenCount         int
		tps                float64
	)

	for {
		var chunk struct {
			Response string `json:"response"` // Standard Ollama schema
			Content  string `json:"content"`  // Standard llama.cpp schema
			Done     bool   `json:"done"`
		}

		if err := decoder.Decode(&chunk); err != nil {
			if err == io.EOF {
				break
			}
			// Silently skip malformed JSON chunks from the stream
			continue
		}

		// Normalize token string based on the engine
		tokenStr := chunk.Response
		if tokenStr == "" {
			tokenStr = chunk.Content
		}

		now := time.Now()
		
		// 3. Isolate Network vs Compute Telemetry
		if !firstTokenReceived {
			observedTTFT = now.Sub(startTime)
			
			// Subtracting network jitter ensures accurate engine evaluation performance
			trueTTFT = observedTTFT - networkRTT
			if trueTTFT < 0 {
				trueTTFT = 0 // Guard against negative time if network RTT spikes unnaturally
			}
			firstTokenReceived = true
		}

		tokenCount++
		elapsed := now.Sub(startTime)
		
		tps = 0.0
		if elapsed.Seconds() > 0 {
			tps = float64(tokenCount) / elapsed.Seconds()
		}

		// Serialize computed frames to the UI overlay
		frame := Frame{
			Type:         "token",
			Content:      tokenStr,
			TPS:          tps,
			TTFTNs:       trueTTFT.Nanoseconds(),
			ObservedTTFT: observedTTFT.Nanoseconds(),
			NetworkRTTNs: networkRTT.Nanoseconds(),
			TotalTokens:  tokenCount,
		}

		if err := wsjson.Write(ctx, c, frame); err != nil {
			// Client disconnected or socket broken
			break
		}

		if chunk.Done {
			break
		}
	}

	// Dispatch final completion frame
	wsjson.Write(ctx, c, Frame{Type: "done"})
	c.Close(websocket.StatusNormalClosure, "Stream completed successfully")

	// Save the run to SQLite
	if h.DB != nil && tokenCount > 0 {
		h.DB.SaveBenchmark(
			string(req.Payload), 
			h.TargetURL.String(), 
			tps, 
			trueTTFT.Nanoseconds(), 
			networkRTT.Nanoseconds(), 
			tokenCount,
		)
	}
}

func (h *ProxyHandler) sendError(ctx context.Context, c *websocket.Conn, msg string) {
	wsjson.Write(ctx, c, Frame{
		Type:  "error",
		Error: msg,
	})
	c.Close(websocket.StatusInternalError, msg)
}
