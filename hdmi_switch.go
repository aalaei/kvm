package kvm

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// The HDMI switch integration is opt-in: nothing runs until an address is
// configured (Settings → Hardware → HDMI Switch).

// hdmiSwitchBaseURL returns the configured switch address as a URL without a
// trailing slash, or "" when no switch is configured. The setting may be a
// bare hostname / mDNS name / IP (optionally with :port) or a full http(s) URL.
func hdmiSwitchBaseURL() string {
	raw := ""
	if config != nil {
		raw = config.HDMISwitchURL
	}
	return normalizeHDMISwitchURL(raw)
}

func normalizeHDMISwitchURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	return strings.TrimRight(raw, "/")
}

func validateHDMISwitchURL(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", nil // empty disables the integration
	}
	u, err := url.Parse(normalizeHDMISwitchURL(raw))
	if err != nil {
		return "", fmt.Errorf("invalid address: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("unsupported scheme %q (use http or https)", u.Scheme)
	}
	if u.Hostname() == "" {
		return "", errors.New("address has no host")
	}
	return u.String(), nil
}

type hdmiSwitchCredentials struct {
	username string
	password string
}

func currentHDMISwitchCredentials() hdmiSwitchCredentials {
	if config == nil {
		return hdmiSwitchCredentials{}
	}
	return hdmiSwitchCredentials{username: config.HDMISwitchUsername, password: config.HDMISwitchPassword}
}

// hdmiSwitchTransport is shared by all switch requests so idle keep-alive
// connections are reused instead of accumulating. Its dialer resolves .local
// hostnames via mDNS, since the device's DNS can't resolve them.
var hdmiSwitchTransport = &http.Transport{
	DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
		dialer := &net.Dialer{Timeout: 10 * time.Second}
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
	MaxIdleConnsPerHost: 2,
	IdleConnTimeout:     60 * time.Second,
}

var hdmiSwitchClient = &http.Client{Transport: hdmiSwitchTransport}

// hdmiSwitchRequest performs a request against the switch with basic auth
// (when a username is configured) and maps auth failures to clear errors.
func hdmiSwitchRequest(ctx context.Context, method, baseURL, path string, creds hdmiSwitchCredentials) (*http.Response, error) {
	var body io.Reader
	if method == http.MethodPost {
		body = http.NoBody // ESPHome rejects POSTs without Content-Length (411)
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, body)
	if err != nil {
		return nil, err
	}
	if creds.username != "" {
		req.SetBasicAuth(creds.username, creds.password)
	}
	resp, err := hdmiSwitchClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach HDMI switch: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()
		if creds.username == "" {
			return nil, errors.New("HDMI switch requires a username and password")
		}
		return nil, errors.New("HDMI switch rejected the username or password")
	}
	if resp.StatusCode >= 400 {
		resp.Body.Close()
		return nil, fmt.Errorf("HDMI switch returned HTTP %d", resp.StatusCode)
	}
	return resp, nil
}

type HDMISwitchState struct {
	CurrentPort int      `json:"currentPort"` // 1-5, 0 = unknown
	PortNames   []string `json:"portNames"`   // index 0 = port 1, len=5
	Available   bool     `json:"available"`
	Configured  bool     `json:"configured"`
	SyncUSB     *bool    `json:"syncUsb,omitempty"` // nil = switch has no "Sync USB" entity
	LastError   string   `json:"lastError,omitempty"`
}

var (
	hdmiSwitchState     = &HDMISwitchState{PortNames: make([]string, 5)}
	hdmiSwitchStateLock sync.RWMutex

	// hdmiSwitchReconnect cancels the current SSE subscription so the monitor
	// reconnects immediately with the latest settings.
	hdmiSwitchCancelLock sync.Mutex
	hdmiSwitchCancel     context.CancelFunc
	hdmiSwitchWake       = make(chan struct{}, 1)
)

// sseStatePayload is one ESPHome web_server "state" event. "value" is a
// string for selects/text sensors but a bool for switches, so it is decoded
// leniently; "state" is always a string ("ON"/"OFF", "HDMI3", ...).
type sseStatePayload struct {
	ID    string          `json:"id"`
	Value json.RawMessage `json:"value"`
	State string          `json:"state"`
}

// StringValue returns "value" when it is a JSON string, otherwise "state".
func (p sseStatePayload) StringValue() string {
	var v string
	if json.Unmarshal(p.Value, &v) == nil {
		return v
	}
	return p.State
}

func initHDMISwitch() {
	go runHDMISwitchMonitor()
}

func setHDMISwitchUnavailable(err error) {
	hdmiSwitchStateLock.Lock()
	defer hdmiSwitchStateLock.Unlock()
	hdmiSwitchState.Available = false
	if err != nil {
		hdmiSwitchState.LastError = err.Error()
	}
}

func runHDMISwitchMonitor() {
	for {
		if hdmiSwitchBaseURL() == "" {
			hdmiSwitchStateLock.Lock()
			hdmiSwitchState.Available = false
			hdmiSwitchState.LastError = ""
			hdmiSwitchStateLock.Unlock()
			<-hdmiSwitchWake // idle until configured
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		hdmiSwitchCancelLock.Lock()
		hdmiSwitchCancel = cancel
		hdmiSwitchCancelLock.Unlock()

		err := subscribeHDMISwitchSSE(ctx)
		reconfigured := ctx.Err() != nil
		cancel()

		if reconfigured {
			hdmiSwitchStateLock.Lock()
			hdmiSwitchState.Available = false
			hdmiSwitchState.LastError = ""
			hdmiSwitchStateLock.Unlock()
			select {
			case <-hdmiSwitchWake:
			default:
			}
			continue
		}
		if err == nil {
			err = errors.New("event stream closed")
		}
		logger.Warn().Err(err).Msg("HDMI switch SSE disconnected")
		setHDMISwitchUnavailable(err)

		select {
		case <-time.After(10 * time.Second):
		case <-hdmiSwitchWake:
		}
	}
}

func reconnectHDMISwitch() {
	hdmiSwitchCancelLock.Lock()
	if hdmiSwitchCancel != nil {
		hdmiSwitchCancel()
	}
	hdmiSwitchCancelLock.Unlock()
	select {
	case hdmiSwitchWake <- struct{}{}:
	default:
	}
}

func subscribeHDMISwitchSSE(ctx context.Context) error {
	resp, err := hdmiSwitchRequest(ctx, http.MethodGet, hdmiSwitchBaseURL(), "/events", currentHDMISwitchCredentials())
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	hdmiSwitchStateLock.Lock()
	hdmiSwitchState.Available = true
	hdmiSwitchState.LastError = ""
	hdmiSwitchStateLock.Unlock()
	logger.Info().Str("url", hdmiSwitchBaseURL()).Msg("HDMI switch connected")

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
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

// normalizeESPHomeID maps both ESPHome web_server ID styles to one form:
// legacy "text_sensor-hdmi_1_name" and current "text_sensor/HDMI 1 Name"
// both become "text_sensor-hdmi_1_name".
func normalizeESPHomeID(id string) string {
	id = strings.ToLower(id)
	if domain, name, ok := strings.Cut(id, "/"); ok {
		id = domain + "-" + strings.ReplaceAll(name, " ", "_")
	}
	return id
}

func applyHDMISwitchSSEState(p sseStatePayload) {
	hdmiSwitchStateLock.Lock()
	defer hdmiSwitchStateLock.Unlock()

	v := p.StringValue()
	switch normalizeESPHomeID(p.ID) {
	case "select-hdmi_select":
		hdmiSwitchState.CurrentPort = parseHDMIPortNumber(v)
	case "text_sensor-hdmi_1_name":
		hdmiSwitchState.PortNames[0] = v
	case "text_sensor-hdmi_2_name":
		hdmiSwitchState.PortNames[1] = v
	case "text_sensor-hdmi_3_name":
		hdmiSwitchState.PortNames[2] = v
	case "text_sensor-hdmi_4_name":
		hdmiSwitchState.PortNames[3] = v
	case "text_sensor-hdmi_5_name":
		hdmiSwitchState.PortNames[4] = v
	case "switch-sync_usb":
		on := strings.EqualFold(p.State, "ON")
		hdmiSwitchState.SyncUSB = &on
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
		Configured:  hdmiSwitchBaseURL() != "",
		SyncUSB:     hdmiSwitchState.SyncUSB,
		LastError:   hdmiSwitchState.LastError,
	}, nil
}

func rpcSetHDMIPort(port int) error {
	if port < 1 || port > 5 {
		return fmt.Errorf("invalid HDMI port %d: must be 1–5", port)
	}
	if hdmiSwitchBaseURL() == "" {
		return errors.New("no HDMI switch configured")
	}
	path := "/select/HDMI%20select/set?option=" + url.QueryEscape(fmt.Sprintf("HDMI%d", port))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := hdmiSwitchRequest(ctx, http.MethodPost, hdmiSwitchBaseURL(), path, currentHDMISwitchCredentials())
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	// Optimistic local update; SSE will confirm shortly
	hdmiSwitchStateLock.Lock()
	hdmiSwitchState.CurrentPort = port
	hdmiSwitchStateLock.Unlock()

	return nil
}

// rpcSetHDMISyncUSB turns the switch's "Sync USB" option on or off (USB
// follows the selected HDMI input when on).
func rpcSetHDMISyncUSB(enabled bool) error {
	if hdmiSwitchBaseURL() == "" {
		return errors.New("no HDMI switch configured")
	}
	action := "turn_off"
	if enabled {
		action = "turn_on"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := hdmiSwitchRequest(ctx, http.MethodPost, hdmiSwitchBaseURL(), "/switch/Sync%20USB/"+action, currentHDMISwitchCredentials())
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	// Optimistic local update; SSE will confirm shortly
	hdmiSwitchStateLock.Lock()
	hdmiSwitchState.SyncUSB = &enabled
	hdmiSwitchStateLock.Unlock()
	return nil
}

// HDMISwitchConfig is the settings form. The stored password is never sent
// to the browser: reads report only HasPassword, and on save an empty
// Password keeps the stored one unless ClearPassword is set.
type HDMISwitchConfig struct {
	URL           string `json:"url"`
	Username      string `json:"username"`
	Password      string `json:"password,omitempty"`
	HasPassword   bool   `json:"hasPassword"`
	ClearPassword bool   `json:"clearPassword,omitempty"`
}

func rpcGetHDMISwitchConfig() (HDMISwitchConfig, error) {
	return HDMISwitchConfig{
		URL:         config.HDMISwitchURL,
		Username:    config.HDMISwitchUsername,
		HasPassword: config.HDMISwitchPassword != "",
	}, nil
}

func resolveHDMISwitchForm(cfg HDMISwitchConfig) (string, hdmiSwitchCredentials, error) {
	u, err := validateHDMISwitchURL(cfg.URL)
	if err != nil {
		return "", hdmiSwitchCredentials{}, err
	}
	creds := hdmiSwitchCredentials{username: strings.TrimSpace(cfg.Username), password: cfg.Password}
	if creds.password == "" && !cfg.ClearPassword {
		creds.password = config.HDMISwitchPassword
	}
	if creds.username == "" {
		creds.password = ""
	}
	return u, creds, nil
}

func rpcSetHDMISwitchConfig(cfg HDMISwitchConfig) error {
	u, creds, err := resolveHDMISwitchForm(cfg)
	if err != nil {
		return err
	}
	config.HDMISwitchURL = strings.TrimSpace(cfg.URL)
	config.HDMISwitchUsername = creds.username
	config.HDMISwitchPassword = creds.password
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	if u == "" {
		logger.Info().Msg("HDMI switch disabled")
	} else {
		logger.Info().Str("url", u).Bool("auth", creds.username != "").Msg("HDMI switch settings updated")
	}
	reconnectHDMISwitch()
	return nil
}

// rpcTestHDMISwitchConfig checks the form's settings against the switch
// without saving them.
func rpcTestHDMISwitchConfig(cfg HDMISwitchConfig) (string, error) {
	u, creds, err := resolveHDMISwitchForm(cfg)
	if err != nil {
		return "", err
	}
	if u == "" {
		return "", errors.New("enter the switch address first")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := hdmiSwitchRequest(ctx, http.MethodGet, u, "/", creds)
	if err != nil {
		return "", err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return fmt.Sprintf("Connected to %s", u), nil
}
