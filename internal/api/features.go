package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"llm-benchmarker/internal/db"
)

type FeaturesHandler struct {
	DB      *db.Database
	Runner  *BenchmarkHandler
}

// ── Sessions ──

func (h *FeaturesHandler) HandleGetSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := h.DB.GetSessions()
	if err != nil {
		http.Error(w, "failed to get sessions", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// ── Replay ──

func (h *FeaturesHandler) HandleReplay(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	b, err := h.DB.GetBenchmark(id)
	if err != nil || b.RequestBody == "" {
		http.Error(w, "benchmark not found or no request body", http.StatusNotFound)
		return
	}

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Post(b.ProviderURL, "application/json", bytes.NewReader([]byte(b.RequestBody)))
	if err != nil {
		http.Error(w, "replay request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	result := map[string]interface{}{
		"status":   resp.StatusCode,
		"body":     string(body),
		"model":    b.ModelEndpoint,
		"provider": b.ProviderURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ── Schedules ──

func (h *FeaturesHandler) HandleListSchedules(w http.ResponseWriter, r *http.Request) {
	schedules, err := h.DB.ListSchedules()
	if err != nil {
		http.Error(w, "failed to list schedules", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(schedules)
}

func (h *FeaturesHandler) HandleCreateSchedule(w http.ResponseWriter, r *http.Request) {
	var s db.BenchmarkSchedule
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if s.Model == "" || s.CronExpr == "" {
		http.Error(w, "model and cron_expr required", http.StatusBadRequest)
		return
	}
	s.Enabled = true
	id, err := h.DB.CreateSchedule(&s)
	if err != nil {
		http.Error(w, "failed to create schedule", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"id": id})
}

func (h *FeaturesHandler) HandleDeleteSchedule(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.DB.DeleteSchedule(id); err != nil {
		http.Error(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Alert Thresholds ──

func (h *FeaturesHandler) HandleListThresholds(w http.ResponseWriter, r *http.Request) {
	thresholds, err := h.DB.ListThresholds()
	if err != nil {
		http.Error(w, "failed to list thresholds", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(thresholds)
}

func (h *FeaturesHandler) HandleCreateThreshold(w http.ResponseWriter, r *http.Request) {
	var t db.AlertThreshold
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if t.Metric == "" || t.Operator == "" {
		http.Error(w, "metric and operator required", http.StatusBadRequest)
		return
	}
	t.Enabled = true
	id, err := h.DB.CreateThreshold(&t)
	if err != nil {
		http.Error(w, "failed to create threshold", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"id": id})
}

func (h *FeaturesHandler) HandleDeleteThreshold(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.DB.DeleteThreshold(id); err != nil {
		http.Error(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Alert checker ──

func (h *FeaturesHandler) CheckAlerts(benchmarks []db.Benchmark) []map[string]interface{} {
	thresholds, err := h.DB.ListThresholds()
	if err != nil || len(thresholds) == 0 {
		return []map[string]interface{}{}
	}

	alerts := make([]map[string]interface{}, 0)
	for _, t := range thresholds {
		if !t.Enabled {
			continue
		}
		for _, b := range benchmarks {
			if t.Model != "" && b.ModelEndpoint != t.Model {
				continue
			}
			var val float64
			switch t.Metric {
			case "tps":
				val = b.TPS
			case "ttft_ms":
				val = float64(b.TTFTNs) / 1_000_000
			case "duration_ms":
				val = float64(b.DurationMs)
			default:
				continue
			}
			triggered := false
			switch t.Operator {
			case "lt":
				triggered = val < t.Value
			case "gt":
				triggered = val > t.Value
			}
			if triggered {
				alerts = append(alerts, map[string]interface{}{
					"threshold_id": t.ID,
					"metric":       t.Metric,
					"operator":     t.Operator,
					"value":        t.Value,
					"actual":       val,
					"model":        b.ModelEndpoint,
					"benchmark_id": b.ID,
					"timestamp":    b.Timestamp,
				})
			}
		}
	}
	if len(alerts) > 10 {
		alerts = alerts[:10]
	}
	return alerts
}

func (h *FeaturesHandler) HandleCheckAlerts(w http.ResponseWriter, r *http.Request) {
	benchmarks, err := h.DB.GetBenchmarks()
	if err != nil {
		http.Error(w, "failed to get benchmarks", http.StatusInternalServerError)
		return
	}
	alerts := h.CheckAlerts(benchmarks)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

// ── Schedule Checker ──

func (h *FeaturesHandler) CheckSchedules() {
	schedules, err := h.DB.ListSchedules()
	if err != nil {
		return
	}
	now := time.Now()
	for _, s := range schedules {
		if !s.Enabled {
			continue
		}
		if s.LastRunAt != nil {
			next := s.LastRunAt.Add(parseCronInterval(s.CronExpr))
			if now.Before(next) {
				continue
			}
		}
		// Parse the stored config_json for benchmark config
		var cfg BenchmarkConfig
		if s.ConfigJSON != "" {
			json.Unmarshal([]byte(s.ConfigJSON), &cfg)
		}
		if cfg.Model == "" {
			cfg.Model = s.Model
		}
		if cfg.TargetURL == "" {
			cfg.TargetURL = s.TargetURL
		}
		if cfg.NumPredict == 0 {
			cfg.NumPredict = s.NumPredict
		}
		cfg.RunContextScaling = true
		cfg.RunParallelScaling = false
		cfg.RunCombined = false

		runID, err := h.DB.CreateBenchmarkRun(cfg.Model, cfg.TargetURL, cfg.NumPredict, s.ConfigJSON)
		if err != nil {
			h.DB.UpdateScheduleLastRun(s.ID, "failed")
			continue
		}
		go func(id int64, c BenchmarkConfig) {
			if h.Runner != nil {
				h.Runner.runBenchmark(id, c)
			}
			h.DB.UpdateScheduleLastRun(s.ID, "completed")
		}(runID, cfg)
	}
}

func parseCronInterval(expr string) time.Duration {
	switch expr {
	case "@every_5m":
		return 5 * time.Minute
	case "@every_15m":
		return 15 * time.Minute
	case "@every_30m":
		return 30 * time.Minute
	case "@hourly", "0 * * * *":
		return time.Hour
	case "@daily", "0 0 * * *":
		return 24 * time.Hour
	case "@weekly", "0 0 * * 0":
		return 7 * 24 * time.Hour
	default:
		return time.Hour
	}
}

// StartScheduler launches a background goroutine that checks schedules every 30s.
func (h *FeaturesHandler) StartScheduler() {
	go func() {
		for {
			time.Sleep(30 * time.Second)
			h.CheckSchedules()
		}
	}()
	log.Println("benchmark scheduler started (check every 30s)")
}
