#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

build() {
  echo "==> Building frontend..."
  cd ui
  npm install
  npm run build
  cd ..

  echo "==> Building backend..."
  go mod tidy
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "    -> macOS detected, building universal binary"
    GOOS=darwin GOARCH=amd64 go build -buildvcs=false -o /tmp/llm-benchmarker-darwin-amd64
    GOOS=darwin GOARCH=arm64 go build -buildvcs=false -o /tmp/llm-benchmarker-darwin-arm64
    lipo -create /tmp/llm-benchmarker-darwin-amd64 /tmp/llm-benchmarker-darwin-arm64 -output llm-benchmarker
    rm /tmp/llm-benchmarker-darwin-amd64 /tmp/llm-benchmarker-darwin-arm64
  else
    go build -buildvcs=false -o llm-benchmarker
  fi
}

run() {
  echo "==> Starting llm-benchmarker $@"
  echo "    Press r to rebuild, q to quit"
  echo "    Use -intercept-port 11434 to intercept existing Ollama/LiteLLM traffic"
  ./llm-benchmarker "$@" &
  PID=$!
}

cleanup() {
  echo
  echo "==> Stopping..."
  kill "$PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

build
run "$@"

while true; do
  read -rsn1 key
  if [[ "$key" == "r" ]]; then
    echo
    echo "==> Rebuilding..."
    kill "$PID" 2>/dev/null || true
    build
    run "$@"
  elif [[ "$key" == "q" ]]; then
    echo
    echo "==> Stopping..."
    kill "$PID" 2>/dev/null || true
    exit 0
  fi
done
