package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"llm-benchmarker/internal/db"
)

type BenchmarkHandler struct {
	DB *db.Database
}

type BenchmarkConfig struct {
	Model               string `json:"model"`
	TargetURL           string `json:"target_url"`
	NumPredict          int    `json:"num_predict"`
	ContextMultipliers  []int  `json:"context_multipliers,omitempty"`
	ParallelUsers       []int  `json:"parallel_users,omitempty"`
	RunContextScaling   bool   `json:"run_context_scaling"`
	RunParallelScaling  bool   `json:"run_parallel_scaling"`
	RunCombined         bool   `json:"run_combined"`
}

func defaultConfig() BenchmarkConfig {
	return BenchmarkConfig{
		Model:      "gemma4:26b-mlx",
		TargetURL:  "http://127.0.0.1:11434/api/generate",
		NumPredict: 100,
		ContextMultipliers: []int{25, 50, 100, 150, 200, 250, 300, 350, 400},
		ParallelUsers:      []int{1, 2, 4, 8},
		RunContextScaling:  true,
		RunParallelScaling: true,
		RunCombined:        true,
	}
}

type BenchmarkRunDetail struct {
	db.BenchmarkRun
	Results []db.BenchmarkResult `json:"results"`
}

var baseText = strings.Repeat(
	"Quantum computing is a rapidly emerging technology that harnesses quantum mechanics to solve problems too complex for classical computers. ",
	20,
)

type ollamaResponse struct {
	Model              string `json:"model"`
	Response           string `json:"response"`
	Done               bool   `json:"done"`
	TotalDuration      int64  `json:"total_duration,omitempty"`
	PromptEvalCount    int    `json:"prompt_eval_count,omitempty"`
	PromptEvalDuration int64  `json:"prompt_eval_duration,omitempty"`
	EvalCount          int    `json:"eval_count,omitempty"`
	EvalDuration       int64  `json:"eval_duration,omitempty"`
}

func sendOllamaRequest(url, model, prompt string, numPredict int) (*ollamaResponse, time.Duration, error) {
	payload := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]int{
			"num_predict": numPredict,
		},
	}
	body, _ := json.Marshal(payload)

	start := time.Now()
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	elapsed := time.Since(start)
	if err != nil {
		return nil, elapsed, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, elapsed, fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}

	var or ollamaResponse
	if err := json.Unmarshal(respBody, &or); err != nil {
		return nil, elapsed, fmt.Errorf("parse failed: %w", err)
	}
	return &or, elapsed, nil
}

func (h *BenchmarkHandler) HandleRun(w http.ResponseWriter, r *http.Request) {
	var cfg BenchmarkConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		cfg = defaultConfig()
	}
	if cfg.Model == "" || cfg.TargetURL == "" {
		http.Error(w, "model and target_url required", http.StatusBadRequest)
		return
	}
	if cfg.NumPredict == 0 {
		cfg.NumPredict = 100
	}
	if len(cfg.ContextMultipliers) == 0 {
		cfg.ContextMultipliers = defaultConfig().ContextMultipliers
	}
	if len(cfg.ParallelUsers) == 0 {
		cfg.ParallelUsers = defaultConfig().ParallelUsers
	}

	cfgJSON, _ := json.Marshal(cfg)
	runID, err := h.DB.CreateBenchmarkRun(cfg.Model, cfg.TargetURL, cfg.NumPredict, string(cfgJSON))
	if err != nil {
		http.Error(w, "failed to create run", http.StatusInternalServerError)
		return
	}

	go h.runBenchmark(runID, cfg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"run_id": runID})
}

func (h *BenchmarkHandler) runBenchmark(runID int64, cfg BenchmarkConfig) {
	save := func(res *db.BenchmarkResult) {
		if err := h.DB.AddBenchmarkResult(runID, res); err != nil {
			log.Printf("benchmark: save result: %v", err)
		}
	}
	fail := func() {
		h.DB.UpdateBenchmarkRunStatus(runID, "failed")
	}

	if cfg.RunContextScaling {
		log.Printf("benchmark %d: starting context scaling", runID)
		for _, mult := range cfg.ContextMultipliers {
			prompt := fmt.Sprintf("Summarize this:\n\n%s", strings.Repeat(baseText, mult))
			or, elapsed, err := sendOllamaRequest(cfg.TargetURL, cfg.Model, prompt, cfg.NumPredict)
			if err != nil {
				log.Printf("benchmark %d: context scaling mult=%d: %v", runID, mult, err)
				fail()
				return
			}
			save(&db.BenchmarkResult{
				TestType:             "context_scaling",
				ContextMultiplier:    mult,
				PromptTokens:         or.PromptEvalCount,
				PromptEvalDurationNs: or.PromptEvalDuration,
				EvalCount:            or.EvalCount,
				EvalDurationNs:       or.EvalDuration,
				WallTimeMs:           elapsed.Milliseconds(),
			})
		}
		log.Printf("benchmark %d: context scaling done", runID)
	}

	if cfg.RunParallelScaling {
		log.Printf("benchmark %d: starting parallel scaling", runID)
		mult := 25
		prompt := fmt.Sprintf("Summarize this:\n\n%s", strings.Repeat(baseText, mult))
		for _, users := range cfg.ParallelUsers {
			var mu sync.Mutex
			var wg sync.WaitGroup
			for range users {
				wg.Add(1)
				go func() {
					defer wg.Done()
					or, elapsed, err := sendOllamaRequest(cfg.TargetURL, cfg.Model, prompt, cfg.NumPredict)
					if err != nil {
						log.Printf("benchmark %d: parallel users=%d: %v", runID, users, err)
						return
					}
					mu.Lock()
					save(&db.BenchmarkResult{
						TestType:             "parallel_scaling",
						ParallelUsers:        users,
						PromptTokens:         or.PromptEvalCount,
						PromptEvalDurationNs: or.PromptEvalDuration,
						EvalCount:            or.EvalCount,
						EvalDurationNs:       or.EvalDuration,
						WallTimeMs:           elapsed.Milliseconds(),
					})
					mu.Unlock()
				}()
			}
			wg.Wait()
		}
		log.Printf("benchmark %d: parallel scaling done", runID)
	}

	if cfg.RunCombined {
		log.Printf("benchmark %d: starting combined matrix", runID)
		for _, users := range []int{1, 2, 4} {
			for _, mult := range []int{25, 50, 75, 100, 125, 150, 175, 200} {
				prompt := fmt.Sprintf("Summarize this:\n\n%s", strings.Repeat(baseText, mult))
				var mu sync.Mutex
				var wg sync.WaitGroup
				for range users {
					wg.Add(1)
					go func() {
						defer wg.Done()
						or, elapsed, err := sendOllamaRequest(cfg.TargetURL, cfg.Model, prompt, cfg.NumPredict)
						if err != nil {
							log.Printf("benchmark %d: combined users=%d mult=%d: %v", runID, users, mult, err)
							return
						}
						mu.Lock()
						save(&db.BenchmarkResult{
							TestType:             "combined",
							ContextMultiplier:    mult,
							ParallelUsers:        users,
							PromptTokens:         or.PromptEvalCount,
							PromptEvalDurationNs: or.PromptEvalDuration,
							EvalCount:            or.EvalCount,
							EvalDurationNs:       or.EvalDuration,
							WallTimeMs:           elapsed.Milliseconds(),
						})
						mu.Unlock()
					}()
				}
				wg.Wait()
			}
		}
		log.Printf("benchmark %d: combined matrix done", runID)
	}

	h.DB.UpdateBenchmarkRunStatus(runID, "completed")
	log.Printf("benchmark %d: completed", runID)
}

func (h *BenchmarkHandler) HandleListRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.DB.GetBenchmarkRuns()
	if err != nil {
		http.Error(w, "failed to list runs", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runs)
}

func (h *BenchmarkHandler) HandleGetRun(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	run, err := h.DB.GetBenchmarkRun(id)
	if err != nil {
		http.Error(w, "run not found", http.StatusNotFound)
		return
	}

	results, err := h.DB.GetBenchmarkResults(id)
	if err != nil {
		http.Error(w, "failed to get results", http.StatusInternalServerError)
		return
	}

	detail := BenchmarkRunDetail{
		BenchmarkRun: *run,
		Results:      results,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func (h *BenchmarkHandler) HandleDeleteRun(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.DB.DeleteBenchmarkRun(id); err != nil {
		http.Error(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
