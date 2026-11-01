package kvm

import (
	"sync"
	"time"
)

type RateLimitInfo struct {
	Failures       int
	BlockUntil     time.Time
	PenaltySeconds int
	LastSeen       time.Time
}

var (
	ipRateLimits   = make(map[string]*RateLimitInfo)
	ipRateLimitsMu sync.Mutex
)

const (
	MaxFailures      = 5
	BasePenalty      = 10 * 60 // 10 minutes in seconds
	CleanupInterval  = 1 * time.Hour
	RecordExpiration = 24 * time.Hour
)

func init() {
	go func() {
		for {
			time.Sleep(CleanupInterval)
			cleanupRateLimits()
		}
	}()
}

func cleanupRateLimits() {
	ipRateLimitsMu.Lock()
	defer ipRateLimitsMu.Unlock()

	now := time.Now()
	for ip, info := range ipRateLimits {
		if now.Sub(info.LastSeen) > RecordExpiration {
			delete(ipRateLimits, ip)
		}
	}
}

// CheckRateLimit checks if the IP is allowed to attempt login.
// Returns allowed (bool) and waitDuration (time.Duration) if blocked.
func CheckRateLimit(ip string) (bool, time.Duration) {
	ipRateLimitsMu.Lock()
	defer ipRateLimitsMu.Unlock()

	info, exists := ipRateLimits[ip]
	if !exists {
		return true, 0
	}

	if time.Now().Before(info.BlockUntil) {
		return false, info.BlockUntil.Sub(time.Now())
	}

	return true, 0
}

// RecordFailure records a failed login attempt for the IP.
func RecordFailure(ip string) {
	ipRateLimitsMu.Lock()
	defer ipRateLimitsMu.Unlock()

	info, exists := ipRateLimits[ip]
	if !exists {
		info = &RateLimitInfo{
			PenaltySeconds: BasePenalty,
		}
		ipRateLimits[ip] = info
	}

	info.LastSeen = time.Now()
	info.Failures++

	if info.Failures >= MaxFailures {
		info.BlockUntil = time.Now().Add(time.Duration(info.PenaltySeconds) * time.Second)
		
		// Extend penalty for next time. Doubling the penalty.
		info.PenaltySeconds *= 2
	}
}

// RecordSuccess resets the rate limit for the IP.
func RecordSuccess(ip string) {
	ipRateLimitsMu.Lock()
	defer ipRateLimitsMu.Unlock()
	delete(ipRateLimits, ip)
}
