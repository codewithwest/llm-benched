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
		request_body TEXT DEFAULT '',
		response_body TEXT DEFAULT ''
	);`

	if _, err := db.Exec(createTableQuery); err != nil {
		return nil, err
	}

	// Migrate old DBs: add columns that may not exist yet
	db.Exec("ALTER TABLE benchmarks ADD COLUMN request_body TEXT DEFAULT ''")
	db.Exec("ALTER TABLE benchmarks ADD COLUMN response_body TEXT DEFAULT ''")

	return &Database{db: db}, nil
}

func (d *Database) SaveBenchmark(prompt, endpoint, providerURL string, tps float64, ttftNs, rttNs int64, totalTokens, promptLength, responseLength int, requestBody, responseBody string) error {
	query := `INSERT INTO benchmarks (prompt, prompt_length, model_endpoint, provider_url, tps, ttft_ns, network_rtt_ns, total_tokens, response_length, request_body, response_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := d.db.Exec(query, prompt, promptLength, endpoint, providerURL, tps, ttftNs, rttNs, totalTokens, responseLength, requestBody, responseBody)
	if err != nil {
		log.Printf("Failed to save benchmark: %v", err)
	}
	return err
}

func (d *Database) GetBenchmarks() ([]Benchmark, error) {
	query := `SELECT id, timestamp, prompt, prompt_length, model_endpoint, provider_url, tps, ttft_ns, network_rtt_ns, total_tokens, response_length FROM benchmarks ORDER BY id DESC LIMIT 200`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	benchmarks := make([]Benchmark, 0)
	for rows.Next() {
		var b Benchmark
		if err := rows.Scan(&b.ID, &b.Timestamp, &b.Prompt, &b.PromptLength, &b.ModelEndpoint, &b.ProviderURL, &b.TPS, &b.TTFTNs, &b.NetworkRTTNs, &b.TotalTokens, &b.ResponseLength); err != nil {
			log.Printf("Failed to scan benchmark row: %v", err)
			continue
		}
		benchmarks = append(benchmarks, b)
	}
	return benchmarks, nil
}

func (d *Database) GetBenchmark(id int) (*Benchmark, error) {
	query := `SELECT id, timestamp, prompt, prompt_length, model_endpoint, provider_url, tps, ttft_ns, network_rtt_ns, total_tokens, response_length, request_body, response_body FROM benchmarks WHERE id = ?`
	var b Benchmark
	err := d.db.QueryRow(query, id).Scan(&b.ID, &b.Timestamp, &b.Prompt, &b.PromptLength, &b.ModelEndpoint, &b.ProviderURL, &b.TPS, &b.TTFTNs, &b.NetworkRTTNs, &b.TotalTokens, &b.ResponseLength, &b.RequestBody, &b.ResponseBody)
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

func (d *Database) Close() error {
	return d.db.Close()
}
