package db

import (
	"database/sql"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

type Benchmark struct {
	ID           int       `json:"id"`
	Timestamp    time.Time `json:"timestamp"`
	Prompt       string    `json:"prompt"`
	ModelEndpoint string   `json:"model_endpoint"`
	ProviderURL  string    `json:"provider_url"` // [NEW] Added for multi-host strict tracking
	TPS          float64   `json:"tps"`
	TTFTNs       int64     `json:"ttft_ns"`
	NetworkRTTNs int64     `json:"network_rtt_ns"`
	TotalTokens  int       `json:"total_tokens"`
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
		model_endpoint TEXT,
		provider_url TEXT,
		tps REAL,
		ttft_ns INTEGER,
		network_rtt_ns INTEGER,
		total_tokens INTEGER
	);`

	if _, err := db.Exec(createTableQuery); err != nil {
		return nil, err
	}

	return &Database{db: db}, nil
}

func (d *Database) SaveBenchmark(prompt, endpoint, providerURL string, tps float64, ttftNs, rttNs int64, totalTokens int) error {
	query := `INSERT INTO benchmarks (prompt, model_endpoint, provider_url, tps, ttft_ns, network_rtt_ns, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err := d.db.Exec(query, prompt, endpoint, providerURL, tps, ttftNs, rttNs, totalTokens)
	if err != nil {
		log.Printf("Failed to save benchmark: %v", err)
	}
	return err
}

func (d *Database) GetBenchmarks() ([]Benchmark, error) {
	query := `SELECT id, timestamp, prompt, model_endpoint, provider_url, tps, ttft_ns, network_rtt_ns, total_tokens FROM benchmarks ORDER BY id DESC LIMIT 200`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var benchmarks []Benchmark
	for rows.Next() {
		var b Benchmark
		if err := rows.Scan(&b.ID, &b.Timestamp, &b.Prompt, &b.ModelEndpoint, &b.ProviderURL, &b.TPS, &b.TTFTNs, &b.NetworkRTTNs, &b.TotalTokens); err != nil {
			log.Printf("Failed to scan benchmark row: %v", err)
			continue
		}
		benchmarks = append(benchmarks, b)
	}
	return benchmarks, nil
}

func (d *Database) AddProvider(name, url string) error {
	query := `INSERT OR IGNORE INTO providers (name, url) VALUES (?, ?)`
	_, err := d.db.Exec(query, name, url)
	return err
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
