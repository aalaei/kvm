package kvm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

func hdmiSwitchBaseURL() string {
	if config != nil && config.HDMISwitchURL != "" {
		return config.HDMISwitchURL
	}
	return "http://esp-hdmi-mux.local"
}

// hdmiSwitchHTTPClient returns an HTTP client with a dialer that resolves
// .local hostnames via mDNS (since the device DNS can't resolve them).
func hdmiSwitchHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return dialer.DialContext(ctx, network, addr)
			}
			if strings.HasSuffix(host, ".local") && mDNS != nil {
				qCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()
				ip, err := mDNS.QueryAddr(qCtx, host)
				if err != nil {
					logger.Warn().Err(err).Str("host", host).Msg("mDNS lookup failed, using hostname directly")
				} else {
					addr = net.JoinHostPort(ip.String(), port)
				}
			}
			return dialer.DialContext(ctx, network, addr)
		},
	}
	return &http.Client{Timeout: timeout, Transport: transport}
}

type HDMISwitchState struct {
	CurrentPort int      `json:"currentPort"` // 1-5, 0 = unknown
	PortNames   []string `json:"portNames"`   // index 0 = port 1, len=5
	Available   bool     `json:"available"`
}

var (
	hdmiSwitchState     = &HDMISwitchState{PortNames: make([]string, 5)}
	hdmiSwitchStateLock sync.RWMutex
)

type sseStatePayload struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

func initHDMISwitch() {
	go runHDMISwitchMonitor()
}

func runHDMISwitchMonitor() {
	for {
		if err := subscribeHDMISwitchSSE(); err != nil {
			logger.Warn().Err(err).Msg("HDMI switch SSE disconnected")
			hdmiSwitchStateLock.Lock()
			hdmiSwitchState.Available = false
			hdmiSwitchStateLock.Unlock()
		}
		time.Sleep(10 * time.Second)
	}
}

func subscribeHDMISwitchSSE() error {
	client := hdmiSwitchHTTPClient(0) // streaming — no timeout
	resp, err := client.Get(hdmiSwitchBaseURL() + "/events")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	hdmiSwitchStateLock.Lock()
	hdmiSwitchState.Available = true
	hdmiSwitchStateLock.Unlock()

	scanner := bufio.NewScanner(resp.Body)
	var eventType string
	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			eventType = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: ") && eventType == "state":
			var p sseStatePayload
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &p); err == nil {
				applyHDMISwitchSSEState(p)
			}
			eventType = ""
		case line == "":
			eventType = ""
		}
	}
	return scanner.Err()
}

func applyHDMISwitchSSEState(p sseStatePayload) {
	hdmiSwitchStateLock.Lock()
	defer hdmiSwitchStateLock.Unlock()

	switch p.ID {
	case "select-hdmi_select":
		hdmiSwitchState.CurrentPort = parseHDMIPortNumber(p.Value)
	case "text_sensor-hdmi_1_name":
		hdmiSwitchState.PortNames[0] = p.Value
	case "text_sensor-hdmi_2_name":
		hdmiSwitchState.PortNames[1] = p.Value
	case "text_sensor-hdmi_3_name":
		hdmiSwitchState.PortNames[2] = p.Value
	case "text_sensor-hdmi_4_name":
		hdmiSwitchState.PortNames[3] = p.Value
	case "text_sensor-hdmi_5_name":
		hdmiSwitchState.PortNames[4] = p.Value
	}
}

func parseHDMIPortNumber(s string) int {
	if len(s) == 5 && strings.HasPrefix(s, "HDMI") {
		n := int(s[4] - '0')
		if n >= 1 && n <= 5 {
			return n
		}
	}
	return 0
}

func rpcGetHDMISwitchState() (HDMISwitchState, error) {
	hdmiSwitchStateLock.RLock()
	defer hdmiSwitchStateLock.RUnlock()
	// Return a copy with a cloned slice so the caller gets a stable snapshot
	names := make([]string, len(hdmiSwitchState.PortNames))
	copy(names, hdmiSwitchState.PortNames)
	return HDMISwitchState{
		CurrentPort: hdmiSwitchState.CurrentPort,
		PortNames:   names,
		Available:   hdmiSwitchState.Available,
	}, nil
}

func rpcSetHDMIPort(port int) error {
	if port < 1 || port > 5 {
		return fmt.Errorf("invalid HDMI port %d: must be 1–5", port)
	}
	option := fmt.Sprintf("HDMI%d", port)
	postURL := fmt.Sprintf("%s/select/HDMI%%20select/set?option=%s",
		hdmiSwitchBaseURL(), url.QueryEscape(option))

	client := hdmiSwitchHTTPClient(10 * time.Second)
	resp, err := client.Post(postURL, "application/x-www-form-urlencoded", nil)
	if err != nil {
		return fmt.Errorf("failed to reach HDMI switch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("HDMI switch returned HTTP %d", resp.StatusCode)
	}

	// Optimistic local update; SSE will confirm shortly
	hdmiSwitchStateLock.Lock()
	hdmiSwitchState.CurrentPort = port
	hdmiSwitchStateLock.Unlock()

	return nil
}
