#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PIDFILE="/tmp/llm-benchmarker.pid"
LOGFILE="llm-benchmarker.log"

stop_old() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "==> Stopping old instance (PID $(cat "$PIDFILE"))..."
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    sleep 1
    rm -f "$PIDFILE"
  fi
}

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
  local args=("$@")
  echo "==> Starting llm-benchmarker ${args[*]}"
  nohup ./llm-benchmarker "${args[@]}" >> "$LOGFILE" 2>&1 &
  local pid=$!
  echo $pid > "$PIDFILE"
  echo "==> PID $pid | tail -f $LOGFILE to watch | kill -TERM \$(cat $PIDFILE) to stop"
}

stop_old
build
run "$@"
