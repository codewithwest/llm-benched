package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

type Benchmark struct {
	ID             int       `json:"id"`
	Timestamp      time.Time `json:"timestamp"`
	Prompt         string    `json:"prompt"`
	PromptLength   int       `json:"prompt_length"`
	ModelEndpoint  string    `json:"model_endpoint"`
	ProviderURL    string    `json:"provider_url"`
	TPS            float64   `json:"tps"`
	TTFTNs         int64     `json:"ttft_ns"`
	NetworkRTTNs   int64     `json:"network_rtt_ns"`
	TotalTokens    int       `json:"total_tokens"`
	ResponseLength int       `json:"response_length"`
	ClientIP       string    `json:"client_ip"`
	DurationMs     int64     `json:"duration_ms"`
	RequestBody    string    `json:"request_body,omitempty"`
	ResponseBody   string    `json:"response_body,omitempty"`
}

type Provider struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Status    string    `json:"status"` // "online" or "offline"
	LastPing  time.Time `json:"last_ping"`
}

type Database struct {
	db *sql.DB
}

func InitDB(filepath string) (*Database, error) {
	db, err := sql.Open("sqlite", filepath)
	if err != nil {
		return nil, err
	}

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS providers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE,
		url TEXT UNIQUE,
		status TEXT DEFAULT 'offline',
		last_ping DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	
	CREATE TABLE IF NOT EXISTS benchmarks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		prompt TEXT,
		prompt_length INTEGER DEFAULT 0,
		model_endpoint TEXT,
		provider_url TEXT,
		tps REAL,
		ttft_ns INTEGER,
		network_rtt_ns INTEGER,
		total_tokens INTEGER,
		response_length INTEGER DEFAULT 0,
		client_ip TEXT DEFAULT '',
		duration_ms INTEGER DEFAULT 0,
		request_body TEXT DEFAULT '',
		response_body TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS benchmark_runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		model TEXT NOT NULL,
		target_url TEXT NOT NULL,
		num_predict INTEGER DEFAULT 100,
		config_json TEXT,
		status TEXT DEFAULT 'running'
	);

	CREATE TABLE IF NOT EXISTS benchmark_results (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id INTEGER NOT NULL,
		test_type TEXT NOT NULL,
		context_multiplier INTEGER DEFAULT 0,
		parallel_users INTEGER DEFAULT 1,
		prompt_tokens INTEGER DEFAULT 0,
		prompt_eval_duration_ns INTEGER DEFAULT 0,
		eval_count INTEGER DEFAULT 0,
		eval_duration_ns INTEGER DEFAULT 0,
		wall_time_ms INTEGER DEFAULT 0,
		FOREIGN KEY (run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS benchmark_schedules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		model TEXT NOT NULL,
		target_url TEXT NOT NULL,
		num_predict INTEGER DEFAULT 100,
		cron_expr TEXT NOT NULL,
		config_json TEXT,
		enabled INTEGER DEFAULT 1,
		last_run_at DATETIME,
		last_run_status TEXT DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS alert_thresholds (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		metric TEXT NOT NULL,
		operator TEXT NOT NULL,
		value REAL NOT NULL,
		model TEXT DEFAULT '',
		enabled INTEGER DEFAULT 1
	);`

	if _, err := db.Exec(createTableQuery); err != nil {
		return nil, err
	}

	// Migrate old DBs: add columns that may not exist yet
	db.Exec("ALTER TABLE benchmarks ADD COLUMN request_body TEXT DEFAULT ''")
	db.Exec("ALTER TABLE benchmarks ADD COLUMN response_body TEXT DEFAULT ''")
	db.Exec("ALTER TABLE benchmarks ADD COLUMN client_ip TEXT DEFAULT ''")
	db.Exec("ALTER TABLE benchmarks ADD COLUMN duration_ms INTEGER DEFAULT 0")

	return &Database{db: db}, nil
}

func (d *Database) ResolveOrphanedRuns() {
	_, err := d.db.Exec("UPDATE benchmark_runs SET status = 'failed' WHERE status = 'running'")
	if err != nil {
		log.Printf("Failed to resolve orphaned benchmark runs: %v", err)
	}
}

func (d *Database) SaveBenchmark(prompt, endpoint, providerURL, clientIP string, tps float64, ttftNs, rttNs, durationMs int64, totalTokens, promptLength, responseLength int, requestBody, responseBody string) error {
	query := `INSERT INTO benchmarks (prompt, prompt_length, model_endpoint, provider_url, client_ip, duration_ms, tps, ttft_ns, network_rtt_ns, total_tokens, response_length, request_body, response_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := d.db.Exec(query, prompt, promptLength, endpoint, providerURL, clientIP, durationMs, tps, ttftNs, rttNs, totalTokens, responseLength, requestBody, responseBody)
	if err != nil {
		log.Printf("Failed to save benchmark: %v", err)
	}
	return err
}

func (d *Database) GetBenchmarks() ([]Benchmark, error) {
	query := `SELECT id, timestamp, prompt, prompt_length, model_endpoint, provider_url, client_ip, duration_ms, tps, ttft_ns, network_rtt_ns, total_tokens, response_length FROM benchmarks ORDER BY id DESC LIMIT 200`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	benchmarks := make([]Benchmark, 0)
	for rows.Next() {
		var b Benchmark
		if err := rows.Scan(&b.ID, &b.Timestamp, &b.Prompt, &b.PromptLength, &b.ModelEndpoint, &b.ProviderURL, &b.ClientIP, &b.DurationMs, &b.TPS, &b.TTFTNs, &b.NetworkRTTNs, &b.TotalTokens, &b.ResponseLength); err != nil {
			log.Printf("Failed to scan benchmark row: %v", err)
			continue
		}
		benchmarks = append(benchmarks, b)
	}
	return benchmarks, nil
}

func (d *Database) GetBenchmark(id int) (*Benchmark, error) {
	query := `SELECT id, timestamp, prompt, prompt_length, model_endpoint, provider_url, client_ip, duration_ms, tps, ttft_ns, network_rtt_ns, total_tokens, response_length, request_body, response_body FROM benchmarks WHERE id = ?`
	var b Benchmark
	err := d.db.QueryRow(query, id).Scan(&b.ID, &b.Timestamp, &b.Prompt, &b.PromptLength, &b.ModelEndpoint, &b.ProviderURL, &b.ClientIP, &b.DurationMs, &b.TPS, &b.TTFTNs, &b.NetworkRTTNs, &b.TotalTokens, &b.ResponseLength, &b.RequestBody, &b.ResponseBody)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (d *Database) AddProvider(name, url string) error {
	query := `INSERT OR IGNORE INTO providers (name, url) VALUES (?, ?)`
	res, err := d.db.Exec(query, name, url)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("provider with name %q or url %q already exists", name, url)
	}
	return nil
}

func (d *Database) UpdateProviderStatus(id int, status string) error {
	query := `UPDATE providers SET status = ?, last_ping = CURRENT_TIMESTAMP WHERE id = ?`
	_, err := d.db.Exec(query, status, id)
	return err
}

func (d *Database) GetProviders() ([]Provider, error) {
	query := `SELECT id, name, url, status, last_ping FROM providers ORDER BY id ASC`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(&p.ID, &p.Name, &p.URL, &p.Status, &p.LastPing); err != nil {
			continue
		}
		providers = append(providers, p)
	}
	return providers, nil
}

// ── Benchmark Run types ──

type BenchmarkRun struct {
	ID         int       `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	Model      string    `json:"model"`
	TargetURL  string    `json:"target_url"`
	NumPredict int       `json:"num_predict"`
	ConfigJSON string    `json:"config_json"`
	Status     string    `json:"status"`
}

type BenchmarkResult struct {
	ID                   int    `json:"id"`
	RunID                int    `json:"run_id"`
	TestType             string `json:"test_type"`
	ContextMultiplier    int    `json:"context_multiplier"`
	ParallelUsers        int    `json:"parallel_users"`
	PromptTokens         int    `json:"prompt_tokens"`
	PromptEvalDurationNs int64  `json:"prompt_eval_duration_ns"`
	EvalCount            int    `json:"eval_count"`
	EvalDurationNs       int64  `json:"eval_duration_ns"`
	WallTimeMs           int64  `json:"wall_time_ms"`
}

func (r *BenchmarkResult) PromptTPS() float64 {
	if r.PromptEvalDurationNs == 0 || r.PromptTokens == 0 {
		return 0
	}
	return float64(r.PromptTokens) / (float64(r.PromptEvalDurationNs) / 1e9)
}

func (r *BenchmarkResult) GenTPS() float64 {
	if r.EvalDurationNs == 0 || r.EvalCount == 0 {
		return 0
	}
	return float64(r.EvalCount) / (float64(r.EvalDurationNs) / 1e9)
}

func (d *Database) CreateBenchmarkRun(model, targetURL string, numPredict int, configJSON string) (int64, error) {
	query := `INSERT INTO benchmark_runs (model, target_url, num_predict, config_json, status) VALUES (?, ?, ?, ?, 'running')`
	res, err := d.db.Exec(query, model, targetURL, numPredict, configJSON)
	if err != nil {
		log.Printf("Failed to create benchmark run: %v", err)
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) AddBenchmarkResult(runID int64, r *BenchmarkResult) error {
	query := `INSERT INTO benchmark_results (run_id, test_type, context_multiplier, parallel_users, prompt_tokens, prompt_eval_duration_ns, eval_count, eval_duration_ns, wall_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := d.db.Exec(query, runID, r.TestType, r.ContextMultiplier, r.ParallelUsers, r.PromptTokens, r.PromptEvalDurationNs, r.EvalCount, r.EvalDurationNs, r.WallTimeMs)
	if err != nil {
		log.Printf("Failed to add benchmark result: %v", err)
	}
	return err
}

func (d *Database) UpdateBenchmarkRunStatus(id int64, status string) error {
	query := `UPDATE benchmark_runs SET status = ? WHERE id = ?`
	_, err := d.db.Exec(query, status, id)
	if err != nil {
		log.Printf("Failed to update benchmark run status: %v", err)
	}
	return err
}

func (d *Database) GetBenchmarkRuns() ([]BenchmarkRun, error) {
	query := `SELECT id, created_at, model, target_url, num_predict, config_json, status FROM benchmark_runs ORDER BY id DESC LIMIT 50`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := make([]BenchmarkRun, 0)
	for rows.Next() {
		var r BenchmarkRun
		if err := rows.Scan(&r.ID, &r.CreatedAt, &r.Model, &r.TargetURL, &r.NumPredict, &r.ConfigJSON, &r.Status); err != nil {
			log.Printf("Failed to scan benchmark run: %v", err)
			continue
		}
		runs = append(runs, r)
	}
	return runs, nil
}

func (d *Database) GetBenchmarkRun(id int) (*BenchmarkRun, error) {
	query := `SELECT id, created_at, model, target_url, num_predict, config_json, status FROM benchmark_runs WHERE id = ?`
	var r BenchmarkRun
	err := d.db.QueryRow(query, id).Scan(&r.ID, &r.CreatedAt, &r.Model, &r.TargetURL, &r.NumPredict, &r.ConfigJSON, &r.Status)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (d *Database) GetBenchmarkResults(runID int) ([]BenchmarkResult, error) {
	query := `SELECT id, run_id, test_type, context_multiplier, parallel_users, prompt_tokens, prompt_eval_duration_ns, eval_count, eval_duration_ns, wall_time_ms FROM benchmark_results WHERE run_id = ? ORDER BY id ASC`
	rows, err := d.db.Query(query, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]BenchmarkResult, 0)
	for rows.Next() {
		var r BenchmarkResult
		if err := rows.Scan(&r.ID, &r.RunID, &r.TestType, &r.ContextMultiplier, &r.ParallelUsers, &r.PromptTokens, &r.PromptEvalDurationNs, &r.EvalCount, &r.EvalDurationNs, &r.WallTimeMs); err != nil {
			log.Printf("Failed to scan benchmark result: %v", err)
			continue
		}
		results = append(results, r)
	}
	return results, nil
}

func (d *Database) DeleteBenchmarkRun(id int) error {
	d.db.Exec("DELETE FROM benchmark_results WHERE run_id = ?", id)
	_, err := d.db.Exec("DELETE FROM benchmark_runs WHERE id = ?", id)
	return err
}

// ── Sessions ──

type SessionSummary struct {
	ClientIP    string    `json:"client_ip"`
	Count       int       `json:"count"`
	LastSeen    time.Time `json:"last_seen"`
	Models      string    `json:"models"`
}

func (d *Database) GetSessions() ([]SessionSummary, error) {
	query := `SELECT client_ip, COUNT(*) as count, MAX(timestamp) as last_seen, GROUP_CONCAT(DISTINCT model_endpoint) as models FROM benchmarks WHERE client_ip != '' GROUP BY client_ip ORDER BY count DESC LIMIT 50`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]SessionSummary, 0)
	for rows.Next() {
		var s SessionSummary
		if err := rows.Scan(&s.ClientIP, &s.Count, &s.LastSeen, &s.Models); err != nil {
			continue
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// ── Benchmark Schedules ──

type BenchmarkSchedule struct {
	ID             int       `json:"id"`
	CreatedAt      time.Time `json:"created_at"`
	Model          string    `json:"model"`
	TargetURL      string    `json:"target_url"`
	NumPredict     int       `json:"num_predict"`
	CronExpr       string    `json:"cron_expr"`
	ConfigJSON     string    `json:"config_json"`
	Enabled        bool      `json:"enabled"`
	LastRunAt      *time.Time `json:"last_run_at,omitempty"`
	LastRunStatus  string    `json:"last_run_status"`
}

func (d *Database) CreateSchedule(s *BenchmarkSchedule) (int64, error) {
	query := `INSERT INTO benchmark_schedules (model, target_url, num_predict, cron_expr, config_json, enabled) VALUES (?, ?, ?, ?, ?, ?)`
	res, err := d.db.Exec(query, s.Model, s.TargetURL, s.NumPredict, s.CronExpr, s.ConfigJSON, s.Enabled)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListSchedules() ([]BenchmarkSchedule, error) {
	query := `SELECT id, created_at, model, target_url, num_predict, cron_expr, config_json, enabled, last_run_at, last_run_status FROM benchmark_schedules ORDER BY id ASC`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	schedules := make([]BenchmarkSchedule, 0)
	for rows.Next() {
		var s BenchmarkSchedule
		var lastRun sql.NullTime
		if err := rows.Scan(&s.ID, &s.CreatedAt, &s.Model, &s.TargetURL, &s.NumPredict, &s.CronExpr, &s.ConfigJSON, &s.Enabled, &lastRun, &s.LastRunStatus); err != nil {
			continue
		}
		if lastRun.Valid {
			s.LastRunAt = &lastRun.Time
		}
		schedules = append(schedules, s)
	}
	return schedules, nil
}

func (d *Database) DeleteSchedule(id int) error {
	_, err := d.db.Exec("DELETE FROM benchmark_schedules WHERE id = ?", id)
	return err
}

func (d *Database) UpdateScheduleLastRun(id int, status string) {
	d.db.Exec("UPDATE benchmark_schedules SET last_run_at = CURRENT_TIMESTAMP, last_run_status = ? WHERE id = ?", status, id)
}

// ── Alert Thresholds ──

type AlertThreshold struct {
	ID        int       `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Metric    string    `json:"metric"`       // "tps", "ttft_ms", "duration_ms"
	Operator  string    `json:"operator"`     // "lt", "gt"
	Value     float64   `json:"value"`
	Model     string    `json:"model"`        // empty = all models
	Enabled   bool      `json:"enabled"`
}

func (d *Database) CreateThreshold(t *AlertThreshold) (int64, error) {
	query := `INSERT INTO alert_thresholds (metric, operator, value, model, enabled) VALUES (?, ?, ?, ?, ?)`
	res, err := d.db.Exec(query, t.Metric, t.Operator, t.Value, t.Model, t.Enabled)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListThresholds() ([]AlertThreshold, error) {
	query := `SELECT id, created_at, metric, operator, value, model, enabled FROM alert_thresholds ORDER BY id ASC`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	thresholds := make([]AlertThreshold, 0)
	for rows.Next() {
		var t AlertThreshold
		if err := rows.Scan(&t.ID, &t.CreatedAt, &t.Metric, &t.Operator, &t.Value, &t.Model, &t.Enabled); err != nil {
			continue
		}
		thresholds = append(thresholds, t)
	}
	return thresholds, nil
}

func (d *Database) DeleteThreshold(id int) error {
	_, err := d.db.Exec("DELETE FROM alert_thresholds WHERE id = ?", id)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}
