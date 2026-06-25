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
  go build -buildvcs=false -o llm-benchmarker
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
