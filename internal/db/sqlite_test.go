package db

import (
	"testing"
)

func TestInitDB_InMemory(t *testing.T) {
	db, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer db.Close()
}

func TestSaveAndGetBenchmarks(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	err = d.SaveBenchmark("hello", "/api/generate", "http://localhost:11434", 15.5, 1000000, 500000, 150, 5, 500, `{"model":"test"}`, `{"response":"world"}`)
	if err != nil {
		t.Fatalf("SaveBenchmark failed: %v", err)
	}

	benchmarks, err := d.GetBenchmarks()
	if err != nil {
		t.Fatalf("GetBenchmarks failed: %v", err)
	}

	if len(benchmarks) != 1 {
		t.Fatalf("expected 1 benchmark, got %d", len(benchmarks))
	}

	b := benchmarks[0]
	if b.Prompt != "hello" {
		t.Errorf("expected prompt 'hello', got %q", b.Prompt)
	}
	if b.PromptLength != 5 {
		t.Errorf("expected PromptLength 5, got %d", b.PromptLength)
	}
	if b.ResponseLength != 500 {
		t.Errorf("expected ResponseLength 500, got %d", b.ResponseLength)
	}
	if b.ModelEndpoint != "/api/generate" {
		t.Errorf("expected endpoint '/api/generate', got %q", b.ModelEndpoint)
	}
	if b.ProviderURL != "http://localhost:11434" {
		t.Errorf("expected provider URL 'http://localhost:11434', got %q", b.ProviderURL)
	}
	if b.TPS != 15.5 {
		t.Errorf("expected TPS 15.5, got %f", b.TPS)
	}
	if b.TTFTNs != 1000000 {
		t.Errorf("expected TTFTNs 1000000, got %d", b.TTFTNs)
	}
	if b.TotalTokens != 150 {
		t.Errorf("expected TotalTokens 150, got %d", b.TotalTokens)
	}

	// Test GetBenchmark detail
	detail, err := d.GetBenchmark(b.ID)
	if err != nil {
		t.Fatalf("GetBenchmark failed: %v", err)
	}
	if detail.RequestBody != `{"model":"test"}` {
		t.Errorf("expected request body %q, got %q", `{"model":"test"}`, detail.RequestBody)
	}
	if detail.ResponseBody != `{"response":"world"}` {
		t.Errorf("expected response body %q, got %q", `{"response":"world"}`, detail.ResponseBody)
	}
}

func TestGetBenchmarks_EmptyDB(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	benchmarks, err := d.GetBenchmarks()
	if err != nil {
		t.Fatalf("GetBenchmarks failed: %v", err)
	}

	if len(benchmarks) != 0 {
		t.Errorf("expected 0 benchmarks, got %d", len(benchmarks))
	}
}

func TestAddAndGetProviders(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	err = d.AddProvider("engine-1", "http://localhost:11434")
	if err != nil {
		t.Fatalf("AddProvider failed: %v", err)
	}

	err = d.AddProvider("engine-2", "http://localhost:11435")
	if err != nil {
		t.Fatalf("AddProvider failed: %v", err)
	}

	providers, err := d.GetProviders()
	if err != nil {
		t.Fatalf("GetProviders failed: %v", err)
	}

	if len(providers) != 2 {
		t.Fatalf("expected 2 providers, got %d", len(providers))
	}

	if providers[0].Name != "engine-1" {
		t.Errorf("expected name 'engine-1', got %q", providers[0].Name)
	}
	if providers[1].Name != "engine-2" {
		t.Errorf("expected name 'engine-2', got %q", providers[1].Name)
	}
}

func TestAddProvider_Duplicate(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	err = d.AddProvider("engine-1", "http://localhost:11434")
	if err != nil {
		t.Fatalf("first AddProvider failed: %v", err)
	}

	err = d.AddProvider("engine-1", "http://localhost:11434")
	if err == nil {
		t.Fatal("expected error on duplicate AddProvider, got nil")
	}

	providers, _ := d.GetProviders()
	if len(providers) != 1 {
		t.Errorf("expected 1 provider after rejected duplicate, got %d", len(providers))
	}
}

func TestUpdateProviderStatus(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	d.AddProvider("engine-1", "http://localhost:11434")
	providers, _ := d.GetProviders()

	if len(providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(providers))
	}

	if providers[0].Status != "offline" {
		t.Errorf("expected initial status 'offline', got %q", providers[0].Status)
	}

	err = d.UpdateProviderStatus(providers[0].ID, "online")
	if err != nil {
		t.Fatalf("UpdateProviderStatus failed: %v", err)
	}

	providers, _ = d.GetProviders()
	if providers[0].Status != "online" {
		t.Errorf("expected status 'online' after update, got %q", providers[0].Status)
	}
}

func TestMultipleBenchmarks(t *testing.T) {
	d, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer d.Close()

	for i := 0; i < 5; i++ {
		d.SaveBenchmark("prompt", "/api/generate", "http://localhost:11434", float64(i)*10, int64(i)*1000, 0, i*100, 6, 0, "", "")
	}

	benchmarks, err := d.GetBenchmarks()
	if err != nil {
		t.Fatalf("GetBenchmarks failed: %v", err)
	}

	if len(benchmarks) != 5 {
		t.Errorf("expected 5 benchmarks, got %d", len(benchmarks))
	}

	// Test GetBenchmark detail
	b, err := d.GetBenchmark(benchmarks[0].ID)
	if err != nil {
		t.Fatalf("GetBenchmark failed: %v", err)
	}
	if b.RequestBody != "" || b.ResponseBody != "" {
		t.Errorf("expected empty bodies, got request=%q response=%q", b.RequestBody, b.ResponseBody)
	}
}
