# Contributing

Thanks for your interest in contributing to LLM-Benchmarker!

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/<your-username>/llm-benchmarker.git`
3. Install dependencies:
   ```bash
   cd ui && npm install && cd ..
   ```
4. Build and run:
   ```bash
   ./start.sh
   ```

## Project Structure

```
├── main.go                  # Entry point, route registration, static file serving
├── internal/
│   ├── api/                 # HTTP handlers
│   │   ├── handlers.go      # Dashboard, stats, providers CRUD
│   │   ├── benchmark.go     # Benchmark run/result CRUD + runner goroutine
│   │   ├── features.go      # Sessions, replay, schedules, thresholds, alerts
│   │   ├── insights.go      # Aggregated KPIs, LLM summary reports
│   │   └── metrics.go       # Prometheus exposition
│   ├── db/
│   │   └── sqlite.go        # All SQLite schema + queries
│   ├── monitor/
│   │   └── poller.go        # Provider health-check background poller
│   └── proxy/
│       └── interceptor.go   # HTTP proxy, request capture, token counting
├── ui/
│   ├── src/
│   │   ├── App.tsx          # Root component, tabs, KPI cards, chat, detail modal
│   │   ├── BenchmarkPanel.tsx # Benchmark suite UI (form, list, detail, charts)
│   │   └── Select.tsx       # Shared styled dropdown
│   └── public/              # Logo, favicon
└── start.sh                 # Build + run script
```

## Development Workflow

### Frontend
```bash
cd ui && npm run dev     # Vite dev server with hot reload
```

### Backend
```bash
go run .                 # Starts on :8080 by default
```

### Full build
```bash
./start.sh
```

## Pull Request Checklist

- [ ] Code compiles: `go build ./...`
- [ ] TypeScript compiles: `cd ui && npx tsc --noEmit`
- [ ] UI builds: `cd ui && npm run build`
- [ ] Tests pass: `go test ./...`
- [ ] New features include UI components that follow existing design patterns
- [ ] Commits are small and atomic with descriptive messages

## Design Guidelines

- **State management**: plain `useState` / `useEffect` (no external state library)
- **Styling**: Tailwind with custom hex colors (`#FF00FF` accent, `#0E1320` surface, `#222B3D` borders)
- **Icons**: `lucide-react`
- **Charts**: `recharts`
- **API routes**: Go 1.22+ `http.ServeMux` with `PathValue`
- **Database**: SQLite via `mattn/go-sqlite3`
- **Token counting**: `max(streamTokenCount, wordTokenCount)` for streaming NDJSON and non-streaming JSON

## Questions?

Open a [Discussion](https://github.com/codewithwest/llm-benchmarker/discussions) or file an issue.
