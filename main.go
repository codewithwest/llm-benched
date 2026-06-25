package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"llm-benchmarker/internal/api"
	"llm-benchmarker/internal/db"
	"llm-benchmarker/internal/monitor"
	"llm-benchmarker/internal/proxy"
)

//go:embed ui/dist/*
var uiFS embed.FS

func main() {
	port := flag.Int("port", 8080, "Port to serve the application on")
	targetURL := flag.String("target", "http://127.0.0.1:11434", "Remote LLM engine URL")
	dbPath := flag.String("db", "benchmarks.db", "Path to SQLite database")
	flag.Parse()

	// Initialize Database
	database, err := db.InitDB(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()
	log.Printf("Initialized SQLite database at %s", *dbPath)

	// Ensure the default target is added to the database
	database.AddProvider("Default Engine", *targetURL)

	// Start the Background Multi-Host Monitor
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	monitor.StartPoller(database, ctx)

	// Initialize Dashboard API Handler
	dashboardAPI := api.NewDashboardHandler(database, *targetURL)

	// Initialize Transparent Telemetry Proxy
	transparentProxy, err := proxy.NewTransparentProxy(*targetURL, database)
	if err != nil {
		log.Fatalf("Failed to initialize proxy: %v", err)
	}
	log.Printf("Transparent telemetry interception enabled for %s", *targetURL)

	// Set up router
	mux := http.NewServeMux()

	// 1. Dashboard API routes
	mux.HandleFunc("/api/dashboard/stats", dashboardAPI.HandleGetStats)
	mux.HandleFunc("/api/dashboard/models", dashboardAPI.HandleGetModels)
	mux.HandleFunc("/api/dashboard/providers", func(w http.ResponseWriter, req *http.Request) {
		if req.Method == http.MethodPost {
			dashboardAPI.HandleAddProvider(w, req)
		} else {
			dashboardAPI.HandleGetProviders(w, req)
		}
	})

	// 2. Serve UI embedded static files
	uiSubFS, err := fs.Sub(uiFS, "ui/dist")
	if err != nil {
		log.Fatalf("Failed to create sub filesystem: %v", err)
	}
	uiServer := http.FileServer(http.FS(uiSubFS))

	// We create a root handler to route requests
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If it's a UI request (root, index.html, assets/, etc)
		if r.URL.Path == "/" || r.URL.Path == "/index.html" || strings.HasPrefix(r.URL.Path, "/assets/") {
			uiServer.ServeHTTP(w, r)
			return
		}
		
		// Otherwise, it acts as a transparent proxy for ALL other requests (which passes them to Ollama/llama.cpp)
		transparentProxy.ServeHTTP(w, r)
	})

	// Start Server
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Server listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
