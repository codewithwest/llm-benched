# LLM-Benchmarker 🚀

LLM-Benchmarker is an open-source, single-binary cross-platform desktop utility designed to measure the raw inference compute performance of local or network-attached LLM engines like **Ollama** and **llama.cpp**.

With a beautiful glassmorphic dark-mode dashboard and a precise backend telemetry proxy, it calculates highly accurate metrics (TPS, True TTFT) by isolating the noise of network transport latency from raw token generation time.

---

## 🏗 Architecture

LLM-Benchmarker uses a robust two-tier architecture cleanly compiled into a single executable:

1. **Frontend (Vite + React + TypeScript + TailwindCSS)**:
   - A highly responsive, modern UI featuring a live floating telemetry dashboard.
   - Communicates with the backend exclusively over a full-duplex WebSocket connection to minimize overhead.
   
2. **Backend (Go 1.25+)**:
   - Upgrades incoming connections via `nhooyr.io/websocket`.
   - Embeds the compiled React assets using Go's native `embed.FS`, serving everything without external dependencies.
   - Proxies the generation request to the target engine, calculating real-time metrics.
   - Persists benchmark history to a local pure-Go SQLite database (`modernc.org/sqlite`) ensuring CGO-free, seamless cross-compilation for macOS, Linux, and Windows.

---

## ⚡ Core Concept: Telemetry Isolation

When running an LLM on a distributed local network (LAN) rather than the same physical machine as the UI, standard metric tracking is fundamentally flawed. If you simply measure the time elapsed from request to the first generated token arriving at the UI, you conflate **Network Round Trip Time (RTT)** with the engine's true **Time To First Token (TTFT)**.

### How We Solve It
Before opening the heavy stream, the Go proxy fires a lightweight `HEAD` request to sample the baseline network latency to the target machine. 

As the token stream begins:
`True TTFT = Observed TTFT (Proxy Client) - Baseline Network RTT`

This subtraction ensures that if your local Wi-Fi drops a packet or experiences momentary jitter, the application will not falsely penalize the engine's recorded evaluation performance in the database.

---

## 🛠 Building from Source

To compile the single-binary application, you must first build the frontend assets, then compile the Go application.

### Prerequisites
- Node.js (v18+) and npm
- Go (1.25+)

### Steps

1. **Build the React UI**
   ```bash
   cd ui
   npm install
   npm run build
   cd ..
   ```

2. **Build the Go Binary**
   ```bash
   go mod tidy
   # The resulting binary is completely statically linked and requires no C libraries
   go build -buildvcs=false -o llm-benchmarker
   ```

---

## 🚀 Usage & Configuration

Launch the compiled binary from your terminal. By default, it will start on port `8080` and target an Ollama instance running on the local machine (`127.0.0.1:11434`).

```bash
./llm-benchmarker
```

### CLI Flags

You can customize the execution by passing the following flags:

| Flag | Description | Default | Example |
| :--- | :--- | :--- | :--- |
| `-port` | Port to serve the web UI | `8080` | `./llm-benchmarker -port 9000` |
| `-target` | Remote engine target URL | `http://127.0.0.1:11434` | `./llm-benchmarker -target http://192.168.1.50:8080` |
| `-db` | Path to the SQLite history file | `benchmarks.db` | `./llm-benchmarker -db /tmp/run.db` |

### Accessing the Dashboard
Once running, simply open your browser and navigate to:
**http://localhost:8080**

---

## 🌐 Distributed Network Engine Configuration

By default, LLM engines bind to localhost (`127.0.0.1`), meaning they will refuse network connections from the machine running the LLM-Benchmarker. To test remote nodes, you must configure the remote host to listen on all interfaces (`0.0.0.0`).

### Target: Remote Ollama
On the target machine running the model, set the `OLLAMA_HOST` variable before launching the daemon:
```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```
Then, launch the benchmarker on your primary machine:
`./llm-benchmarker -target http://<remote-ip>:11434`

### Target: Remote llama.cpp
When launching `llama-server` on the target machine, pass the host flag explicitly:
```bash
./llama-server -m model.gguf --host 0.0.0.0 --port 8080
```
Then, launch the benchmarker on your primary machine:
`./llm-benchmarker -target http://<remote-ip>:8080`

---

## 📊 The Dashboard UI

The user interface is broken down into intuitive segments:
- **Connection Status**: Indicates whether the socket connection to the proxy handler is established.
- **Inference Prompt**: The textarea where you input the context you wish to evaluate. Hitting `Enter` will initiate generation.
- **Generation Output**: A scrollable glassmorphic pane that continuously streams standard Ollama or llama.cpp JSON outputs dynamically formatted into human text.
- **Floating Telemetry**: Real-time pulses showing:
  - **Eval Rate (TPS)**: Floating-point precision of tokens generated per second.
  - **True TTFT**: Milliseconds taken by the engine to output the first evaluation token.
  - **Network RTT**: The baseline network latency that was stripped from the TTFT.
  - **Total Tokens**: The absolute number of tokens processed in the current stream.

Every stream completion automatically fires a background commit to the local SQLite `benchmarks.db` file, cleanly storing the historical configuration for future analysis.
