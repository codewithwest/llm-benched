# LLM-Benchmarker

[![CI](https://github.com/codewithwest/llm-benchmarker/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithwest/llm-benchmarker/actions/workflows/ci.yml)
[![Go](https://img.shields.io/github/go-mod/go-version/codewithwest/llm-benchmarker)](https://go.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A transparent HTTP proxy that intercepts LLM API calls (Ollama, llama.cpp, OpenAI-compatible), captures full request/response data, and displays real-time telemetry through a web dashboard.

- **No code changes** — sits between your client and LLM engine
- **Captures everything** — full request JSON and response body for every call
- **Live metrics** — TPS, TTFT, token count per request
- **Searchable history** — filter by endpoint, click any request for details
- **Single binary** — Go + embedded React UI, no runtime dependencies

## Install

### Pre-built binaries

Download from [GitHub Releases](https://github.com/codewithwest/llm-benchmarker/releases):

| Platform | File |
|----------|------|
| Linux x86_64 | `llm-benchmarker-linux-amd64` |
| Linux ARM64 | `llm-benchmarker-linux-arm64` |
| macOS Intel | `llm-benchmarker-darwin-amd64` |
| macOS Apple Silicon | `llm-benchmarker-darwin-arm64` |
| macOS Universal | `llm-benchmarker-darwin-universal` |

### Build from source

```bash
git clone https://github.com/codewithwest/llm-benchmarker.git
cd llm-benchmarker

# Build everything in one step:
./start.sh

# Or manually:
cd ui && npm install && npm run build && cd ..
go build -buildvcs=false -o llm-benchmarker .
```

Requires Go 1.25+ and Node.js 22+.

## Quick Start

Point it at a running Ollama instance:

```bash
# Ollama runs on the default port 11434
./llm-benchmarker
```

Open http://localhost:8080 in your browser. The dashboard loads — send a prompt through the chat panel. Every response is recorded as a card in the **Requests** tab.

### Transparent intercept mode

Replace Ollama's port so existing clients are intercepted automatically:

```bash
# 1. Move Ollama to port 11435
OLLAMA_HOST=0.0.0.0:11435 ollama serve

# 2. Run benchmarker on port 11434, forwarding to 11435
./llm-benchmarker -port 8090 -intercept-port 11434 -target http://127.0.0.1:11435

# 3. Any client hitting port 11434 gets intercepted and proxied to 11435
```

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | Port for the web UI and API |
| `-target` | `http://127.0.0.1:11434` | Upstream LLM engine URL |
| `-intercept-port` | `0` | If set, also listen on this port as a transparent intercept proxy |
| `-db` | `benchmarks.db` | Path to SQLite database file |

## Dashboard

### Dashboard tab
- **KPIs** — active providers, average TPS, average TTFT, total requests
- **TPS Trend** — real-time chart of tokens-per-second over time
- **Recent Activity** — last 5 requests as clickable cards

### Requests tab
- Full history of all intercepted requests
- Filter by endpoint
- Click any card to open the **detail modal** showing:
  - Telemetry (TPS, TTFT, tokens, model)
  - Formatted **Request JSON**
  - Formatted **Response Body**

### Providers tab
- Register and monitor remote LLM engine nodes
- Each node is health-checked every 5 seconds
- Select an active provider for the chat panel

### Chat panel
- FAB button (bottom-right) opens a streaming chat overlay
- Select a model and provider, type a prompt, hit Enter
- Response streams in real-time

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Browser    │ HTTP  │  llm-benchmarker │ HTTP  │    Ollama    │
│  (React UI)  │──────▶│   (Go Proxy)    │──────▶│  (Engine)    │
│              │◀──────│                  │◀──────│              │
└──────────────┘      │   ┌──────────┐   │      └──────────────┘
                      │   │ SQLite   │   │
                      │   │  store   │   │
                      │   └──────────┘   │
                      └──────────────────┘
```

1. Browser sends a prompt to the Go server
2. Server forwards the request to the upstream LLM engine
3. Response streams back to the browser in real-time
4. On completion, full request/response is saved to SQLite

The proxy handles both streaming and non-streaming responses, counting tokens by tracking newline-delimited JSON objects (streaming) and whitespace-separated words (non-streaming fallback).

## Use Cases

- **Benchmarking** — measure TPS, TTFT across different models and hardware
- **Auditing** — inspect every prompt and response sent to your LLM
- **Debugging** — see exactly what your client sends and what the engine returns
- **Monitoring** — track usage patterns, response quality, latency trends

## Development

```bash
# Frontend dev server (hot reload)
cd ui && npm run dev

# Build everything
./start.sh

# Run tests
go test ./internal/...
```

## CI/CD

Push to `main` triggers:
- `ci.yml` — builds frontend, runs Go tests, compiles binary

Push a tag (`v*`) triggers:
- `release.yml` — cross-compiles for linux/darwin (amd64 + arm64), creates a macOS universal binary with `lipo`, publishes to GitHub Releases

## License

MIT
