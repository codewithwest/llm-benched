package monitor

import (
	"context"
	"log"
	"net/http"
	"time"

	"llm-benchmarker/internal/db"
)

func StartPoller(database *db.Database, ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	client := &http.Client{Timeout: 2 * time.Second}

	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				providers, err := database.GetProviders()
				if err != nil {
					continue
				}

				for _, p := range providers {
					go func(prov db.Provider) {
						// Simple health check via HTTP HEAD or GET
						resp, err := client.Get(prov.URL)
						status := "online"
						if err != nil || resp.StatusCode >= 500 {
							status = "offline"
						} else {
							resp.Body.Close()
						}

						database.UpdateProviderStatus(prov.ID, status)
					}(p)
				}
			}
		}
	}()
	log.Println("Background multi-host monitor started.")
}
