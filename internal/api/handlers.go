package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"llm-benchmarker/internal/db"
)

type DashboardHandler struct {
	DB        *db.Database
	TargetURL string
}

func NewDashboardHandler(database *db.Database, targetURL string) *DashboardHandler {
	return &DashboardHandler{
		DB:        database,
		TargetURL: targetURL,
	}
}

func (h *DashboardHandler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	benchmarks, err := h.DB.GetBenchmarks()
	if err != nil {
		http.Error(w, "Failed to get benchmarks", http.StatusInternalServerError)
		return
	}

	response := struct {
		Benchmarks []db.Benchmark `json:"benchmarks"`
		Active     []interface{}  `json:"active_requests"`
	}{
		Benchmarks: benchmarks,
		Active:     []interface{}{},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *DashboardHandler) HandleGetBenchmark(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id", http.StatusBadRequest)
		return
	}

	b, err := h.DB.GetBenchmark(id)
	if err != nil {
		http.Error(w, "Benchmark not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func (h *DashboardHandler) HandleGetModels(w http.ResponseWriter, r *http.Request) {
	// Simple proxy to Ollama tags
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(h.TargetURL + "/api/tags")
	if err != nil {
		http.Error(w, "Failed to fetch models", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "Target returned non-200", http.StatusBadGateway)
		return
	}

	// Extract models
	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		// If it fails, try OpenAI/llama.cpp format
		// which we could do, but for brevity just return empty
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"models": []string{}})
		return
	}

	var models []string
	for _, m := range tags.Models {
		models = append(models, m.Name)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"models": models,
	})
}

func (h *DashboardHandler) HandleGetProviders(w http.ResponseWriter, r *http.Request) {
	providers, err := h.DB.GetProviders()
	if err != nil {
		http.Error(w, "Failed to get providers", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": providers,
	})
}

func (h *DashboardHandler) HandleAddProvider(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var p struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	
	if err := h.DB.AddProvider(p.Name, p.URL); err != nil {
		http.Error(w, "Failed to add provider", http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusCreated)
}
