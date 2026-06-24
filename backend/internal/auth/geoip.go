package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// GeoIPResponse defines the expected response from ip-api.com
type GeoIPResponse struct {
	Status  string `json:"status"`
	Country string `json:"country"`
	City    string `json:"city"`
}

// GetLocationFromIP uses a free IP geolocation API to resolve city and country.
func GetLocationFromIP(ip string) string {
	// Strip port if present (e.g. from RemoteAddr)
	if strings.Contains(ip, ":") {
		// handle IPv6 vs IPv4 with port
		if strings.Count(ip, ":") == 1 {
			parts := strings.Split(ip, ":")
			ip = parts[0]
		} else if strings.HasPrefix(ip, "[") && strings.Contains(ip, "]:") {
			// IPv6 like [::1]:8080
			end := strings.Index(ip, "]")
			ip = ip[1:end]
		}
	}

	// Fast path for loopback
	if ip == "127.0.0.1" || ip == "::1" || ip == "" {
		return "Localhost"
	}

	client := http.Client{
		Timeout: 2 * time.Second,
	}
	
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,city", ip)
	resp, err := client.Get(url)
	if err != nil {
		return "Unknown"
	}
	defer resp.Body.Close()

	var geoResp GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&geoResp); err != nil {
		return "Unknown"
	}

	if geoResp.Status != "success" || geoResp.City == "" {
		return "Unknown"
	}

	return fmt.Sprintf("%s, %s", geoResp.City, geoResp.Country)
}
