package kvm

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

type TailScaleSettings struct {
	State    string `json:"state"`
	LoginUrl string `json:"loginUrl"`
	IP       string `json:"ip"`
	XEdge    bool   `json:"xEdge"`
}

func rpcCancelTailScale() error {
	_, err := CallVpnCtrlAction("cancel_tailscale", map[string]interface{}{"type": "no_param"})
	if err != nil {
		return err
	}
	return nil
}

func rpcLoginTailScale(xEdge bool) (TailScaleSettings, error) {
	settings := TailScaleSettings{
		State:    "connecting",
		XEdge:    xEdge,
		LoginUrl: "",
		IP:       "",
	}

	_, err := CallVpnCtrlAction("login_tailscale", map[string]interface{}{"xEdge": xEdge})
	if err != nil {
		return settings, err
	}

	for i := 0; i < 15; i++ {
		time.Sleep(2 * time.Second)

		resp, err := CallVpnCtrlAction("get_tailscale_state", map[string]interface{}{"type": "no_param"})
		if err != nil {
			return settings, err
		}
		if resp.Event == "tailscale_state" {
			if _, ok := resp.Result["state"]; ok {
				settings.State = resp.Result["state"].(string)
			}
			if _, ok := resp.Result["ip"]; ok {
				settings.IP = resp.Result["ip"].(string)
			}
			if _, ok := resp.Result["loginUrl"]; ok {
				settings.LoginUrl = resp.Result["loginUrl"].(string)
			}
			if _, ok := resp.Result["xEdge"]; ok {
				settings.XEdge = resp.Result["xEdge"].(bool)
			}
		}

		switch settings.State {
		case "logined":
			config.TailScaleAutoStart = true
			config.TailScaleXEdge = settings.XEdge
			err := SaveConfig()
			if err != nil {
				vpnLogger.Error().Err(err).Msg("failed to save config")
			}
			return settings, err
		case "connected":
			config.TailScaleAutoStart = true
			config.TailScaleXEdge = settings.XEdge
			err = SaveConfig()
			if err != nil {
				vpnLogger.Error().Err(err).Msg("failed to save config")
			}
			return settings, err
		case "connecting":
			if i >= 10 {
				settings.State = "disconnected"
			} else {
				settings.State = "connecting"
			}
		case "cancel":
			err := rpcLogoutTailScale()
			if err != nil {
				vpnLogger.Error().Err(err).Msg("failed to logout tailscale")
			}
			settings.State = "disconnected"
			return settings, nil
		default:
			settings.State = "disconnected"
		}
	}

	return settings, nil
}

func rpcLogoutTailScale() error {
	_, err := CallVpnCtrlAction("logout_tailscale", map[string]interface{}{"type": "no_param"})
	if err != nil {
		return err
	}
	config.TailScaleAutoStart = false

	if err := SaveConfig(); err != nil {
		return err
	}

	return nil
}

func rpcGetTailScaleSettings() (TailScaleSettings, error) {
	settings := TailScaleSettings{}

	resp, err := CallVpnCtrlAction("get_tailscale_state", map[string]interface{}{"type": "no_param"})
	if err != nil {
		return settings, err
	}
	if resp.Event == "tailscale_state" {
		if _, ok := resp.Result["state"]; ok {
			settings.State = resp.Result["state"].(string)
		}
		if _, ok := resp.Result["ip"]; ok {
			settings.IP = resp.Result["ip"].(string)
		}
		if _, ok := resp.Result["loginUrl"]; ok {
			settings.LoginUrl = resp.Result["loginUrl"].(string)
		}
		if _, ok := resp.Result["xEdge"]; ok {
			settings.XEdge = resp.Result["xEdge"].(bool)
		}
	}

	return settings, nil
}

type ZeroTierSettings struct {
	State     string `json:"state"`
	NetworkID string `json:"networkID"`
	IP        string `json:"ip"`
}

func rpcLoginZeroTier(networkID string) (ZeroTierSettings, error) {
	LoadConfig()
	settings := ZeroTierSettings{
		State:     "connecting",
		NetworkID: networkID,
		IP:        "",
	}

	resp, err := CallVpnCtrlAction("login_zerotier", map[string]interface{}{
		"network_id":        networkID,
		"config_network_id": config.ZeroTierNetworkID,
	})
	if err != nil {
		return ZeroTierSettings{}, err
	}
	if resp.Event == "zerotier_state" {
		if _, ok := resp.Result["state"]; ok {
			settings.State = resp.Result["state"].(string)
		}
		if _, ok := resp.Result["network_id"]; ok {
			settings.NetworkID = resp.Result["network_id"].(string)
		}
		if _, ok := resp.Result["ip"]; ok {
			settings.IP = resp.Result["ip"].(string)
		}
	}

	switch settings.State {
	case "closed":
		config.ZeroTierAutoStart = false
		config.ZeroTierNetworkID = ""
		if err := SaveConfig(); err != nil {
			vpnLogger.Error().Err(err).Msg("failed to save config")
		}
	case "connected", "logined":
		config.ZeroTierAutoStart = true
		config.ZeroTierNetworkID = settings.NetworkID
		if err := SaveConfig(); err != nil {
			vpnLogger.Error().Err(err).Msg("failed to save config")
		}
	}
	/* disconnected - does not handle */

	return settings, nil
}

func rpcLogoutZeroTier(networkID string) error {
	_, err := CallVpnCtrlAction("logout_zerotier", map[string]interface{}{
		"network_id": networkID,
	})
	if err != nil {
		return err
	}

	config.ZeroTierAutoStart = false
	config.ZeroTierNetworkID = ""
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetZeroTierSettings() (ZeroTierSettings, error) {
	LoadConfig()
	configNetworkID := fmt.Sprintf("%v", config.ZeroTierNetworkID)
	settings := ZeroTierSettings{
		State:     "disconnected",
		NetworkID: configNetworkID,
		IP:        "",
	}

	resp, err := CallVpnCtrlAction("get_zerotier_state", map[string]interface{}{
		"network_id": configNetworkID,
	})
	if err != nil {
		return settings, err
	}
	if resp.Event == "zerotier_state" {
		if _, ok := resp.Result["state"]; ok {
			settings.State = resp.Result["state"].(string)
		}
		if _, ok := resp.Result["network_id"]; ok {
			settings.NetworkID = resp.Result["network_id"].(string)
		}
		if _, ok := resp.Result["ip"]; ok {
			settings.IP = resp.Result["ip"].(string)
		}
	}

	return settings, nil
}

type VpnUpdateDisplayState struct {
	TailScaleState string `json:"tailscale_state"`
	ZeroTierState  string `json:"zerotier_state"`
	Error          string `json:"error,omitempty"` //no_signal, no_lock, out_of_range
}

func HandleVpnDisplayUpdateMessage(event CtrlResponse) {
	waitDisplayUpdate.Lock()
	defer waitDisplayUpdate.Unlock()
	waitDisplayCtrlClientConnected()

	vpnUpdateDisplayState := VpnUpdateDisplayState{}
	err := json.Unmarshal(event.Data, &vpnUpdateDisplayState)
	if err != nil {
		vpnLogger.Warn().Err(err).Msg("Error parsing vpn state json")
		return
	}

	switch vpnUpdateDisplayState.TailScaleState {
	case "connected":
		updateLabelIfChanged("Network_TailScale_Label", "Connected")
	case "logined":
		updateLabelIfChanged("Network_TailScale_Label", "Logined")
	default:
		updateLabelIfChanged("Network_TailScale_Label", "Disconnected")
	}

	switch vpnUpdateDisplayState.ZeroTierState {
	case "connected":
		updateLabelIfChanged("Network_ZeroTier_Label", "Connected")
	case "logined":
		updateLabelIfChanged("Network_ZeroTier_Label", "Logined")
	default:
		updateLabelIfChanged("Network_ZeroTier_Label", "Disconnected")
	}
}

type FrpcStatus struct {
	Running bool `json:"running"`
}

var (
	frpcTomlPath = "/userdata/frpc/frpc.toml"
	frpcLogPath  = "/tmp/frpc.log"
)

func frpcRunning() bool {
	cmd := exec.Command("pgrep", "-x", "frpc")
	return cmd.Run() == nil
}

func rpcGetFrpcLog() (string, error) {
	f, err := os.Open(frpcLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("frpc log file not exist")
		}
		return "", err
	}
	defer f.Close()

	const want = 30
	lines := make([]string, 0, want+10)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > want {
			lines = lines[1:]
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}

	var buf []byte
	for _, l := range lines {
		buf = append(buf, l...)
		buf = append(buf, '\n')
	}
	return string(buf), nil
}

func rpcGetFrpcToml() (string, error) {
	return config.FrpcToml, nil
}

func rpcStartFrpc(frpcToml string) error {
	if frpcRunning() {
		_ = exec.Command("pkill", "-x", "frpc").Run()
	}

	if frpcToml != "" {
		_ = os.MkdirAll(filepath.Dir(frpcTomlPath), 0700)
		if err := os.WriteFile(frpcTomlPath, []byte(frpcToml), 0600); err != nil {
			return err
		}
		cmd := exec.Command(resolveVpnToolBinary("frpc", "frpc"), "-c", frpcTomlPath)
		cmd.Stdout = nil
		cmd.Stderr = nil
		logFile, err := os.OpenFile(frpcLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			return err
		}
		defer logFile.Close()
		cmd.Stdout = logFile
		cmd.Stderr = logFile

		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

		if err := cmd.Start(); err != nil {
			return fmt.Errorf("start frpc failed: %w", err)
		} else {
			config.FrpcAutoStart = true
			config.FrpcToml = frpcToml
			if err := SaveConfig(); err != nil {
				return fmt.Errorf("failed to save config: %w", err)
			}
		}
	} else {
		return fmt.Errorf("frpcToml is empty")
	}

	return nil
}

func rpcStopFrpc() error {
	if frpcRunning() {
		err := exec.Command("pkill", "-x", "frpc").Run()
		if err != nil {
			return fmt.Errorf("failed to stop frpc: %w", err)
		}
	}

	config.FrpcAutoStart = false
	err := SaveConfig()
	if err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetFrpcStatus() (FrpcStatus, error) {
	return FrpcStatus{Running: frpcRunning()}, nil
}

type CloudflaredStatus struct {
	Running bool `json:"running"`
}

func cloudflaredRunning() bool {
	// Only treat long-running tunnel process as running.
	// This avoids false positives from short-lived version checks like `cloudflared -v`.
	cmd := exec.Command("pgrep", "-f", `cloudflared.*tunnel.*run`)
	return cmd.Run() == nil
}

var (
	cloudflaredLogPath = "/tmp/cloudflared.log"
)

func rpcStartCloudflared(token string) error {
	if cloudflaredRunning() {
		_ = exec.Command("pkill", "-x", "cloudflared").Run()
	}
	if token == "" {
		return fmt.Errorf("cloudflared token is empty")
	}
	cmd := exec.Command(resolveVpnToolBinary("cloudflared", "cloudflared"), "tunnel", "run", "--token", token)
	logFile, err := os.OpenFile(cloudflaredLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start cloudflared failed: %w", err)
	}
	config.CloudflaredAutoStart = true
	config.CloudflaredToken = token
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcStopCloudflared() error {
	if cloudflaredRunning() {
		err := exec.Command("pkill", "-x", "cloudflared").Run()
		if err != nil {
			return fmt.Errorf("failed to stop cloudflared: %w", err)
		}
	}
	config.CloudflaredAutoStart = false
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetCloudflaredStatus() (CloudflaredStatus, error) {
	return CloudflaredStatus{Running: cloudflaredRunning()}, nil
}

func rpcGetCloudflaredLog() (string, error) {
	f, err := os.Open(cloudflaredLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("cloudflared log file not exist")
		}
		return "", err
	}
	defer f.Close()

	const want = 30
	lines := make([]string, 0, want+10)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > want {
			lines = lines[1:]
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}

	var buf []byte
	for _, l := range lines {
		buf = append(buf, l...)
		buf = append(buf, '\n')
	}
	return string(buf), nil
}

type EasytierStatus struct {
	Running bool `json:"running"`
}

type EasytierConfig struct {
	Name   string `json:"name"`
	Secret string `json:"secret"`
	Node   string `json:"node"`
}

var (
	easytierLogPath = "/tmp/easytier.log"
)

func easytierRunning() bool {
	cmd := exec.Command("pgrep", "-x", "easytier-core")
	return cmd.Run() == nil
}

func rpcGetEasyTierLog() (string, error) {
	f, err := os.Open(easytierLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("easytier log file not exist")
		}
		return "", err
	}
	defer f.Close()

	const want = 30
	lines := make([]string, 0, want+10)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > want {
			lines = lines[1:]
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}

	var buf []byte
	for _, l := range lines {
		buf = append(buf, l...)
		buf = append(buf, '\n')
	}
	return string(buf), nil
}

func rpcGetEasyTierNodeInfo() (string, error) {
	cmd := exec.Command(resolveVpnToolBinary("easytier", "easytier-cli"), "node")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get easytier node info: %w", err)
	}

	return string(output), nil
}

func rpcGetEasyTierConfig() (EasytierConfig, error) {
	return config.EasytierConfig, nil
}

func rpcStartEasyTier(name, secret, node string) error {
	if easytierRunning() {
		_ = exec.Command("pkill", "-x", "easytier-core").Run()
	}

	if name == "" || secret == "" || node == "" {
		return fmt.Errorf("easytier config is invalid")
	}

	cmd := exec.Command(resolveVpnToolBinary("easytier", "easytier-core"), "-d", "--network-name", name, "--network-secret", secret, "-p", node)
	cmd.Stdout = nil
	cmd.Stderr = nil
	logFile, err := os.OpenFile(easytierLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to open easytier log file: %w", err)
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start easytier failed: %w", err)
	} else {
		config.EasytierAutoStart = true
		config.EasytierConfig = EasytierConfig{
			Name:   name,
			Secret: secret,
			Node:   node,
		}
		if err := SaveConfig(); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
	}

	return nil
}

func rpcStopEasyTier() error {
	if easytierRunning() {
		err := exec.Command("pkill", "-x", "easytier-core").Run()
		if err != nil {
			return fmt.Errorf("failed to stop easytier: %w", err)
		}
	}

	config.EasytierAutoStart = false
	err := SaveConfig()
	if err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetEasyTierStatus() (EasytierStatus, error) {
	return EasytierStatus{Running: easytierRunning()}, nil
}

type VntStatus struct {
	Running bool `json:"running"`
}

var (
	vntLogPath        = "/tmp/vnt.log"
	vntConfigFilePath = "/userdata/vnt/vnt.ini"
)

func vntRunning() bool {
	cmd := exec.Command("pgrep", "-x", "vnt-cli")
	return cmd.Run() == nil
}

func rpcGetVntLog() (string, error) {
	f, err := os.Open(vntLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("vnt log file not exist")
		}
		return "", err
	}
	defer f.Close()

	const want = 30
	lines := make([]string, 0, want+10)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > want {
			lines = lines[1:]
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}

	var buf []byte
	for _, l := range lines {
		buf = append(buf, l...)
		buf = append(buf, '\n')
	}
	return string(buf), nil
}

func rpcGetVntInfo() (string, error) {
	cmd := exec.Command(resolveVpnToolBinary("vnt", "vnt-cli"), "--info")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get vnt info: %w", err)
	}

	return string(output), nil
}

func rpcGetVntConfig() (VntConfig, error) {
	return config.VntConfig, nil
}

func rpcGetVntConfigFile() (string, error) {
	return config.VntConfig.ConfigFile, nil
}

func rpcStartVnt(configMode, token, deviceId, name, serverAddr, configFile string, model string, password string) error {
	if vntRunning() {
		_ = exec.Command("pkill", "-x", "vnt-cli").Run()
	}

	var args []string

	if configMode == "file" {
		// Use config file mode
		if configFile == "" {
			return fmt.Errorf("vnt config file is required in file mode")
		}

		// Save config file
		_ = os.MkdirAll(filepath.Dir(vntConfigFilePath), 0700)
		if err := os.WriteFile(vntConfigFilePath, []byte(configFile), 0600); err != nil {
			return fmt.Errorf("failed to write vnt config file: %w", err)
		}

		args = []string{"-f", vntConfigFilePath}
	} else {
		// Use params mode (default)
		if token == "" {
			return fmt.Errorf("vnt token is required in params mode")
		}

		args = []string{"-k", token}

		if deviceId != "" {
			args = append(args, "-d", deviceId)
		}

		if name != "" {
			args = append(args, "-n", name)
		}

		if serverAddr != "" {
			args = append(args, "-s", serverAddr)
		}

		// Encryption model and password
		if model != "" {
			args = append(args, "--model", model)
		}
		if password != "" {
			args = append(args, "-w", password)
		}

		args = append(args, "--compressor", "lz4")
	}

	cmd := exec.Command(resolveVpnToolBinary("vnt", "vnt-cli"), args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	logFile, err := os.OpenFile(vntLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to open vnt log file: %w", err)
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start vnt failed: %w", err)
	} else {
		config.VntAutoStart = true
		config.VntConfig = VntConfig{
			ConfigMode: configMode,
			Token:      token,
			DeviceId:   deviceId,
			Name:       name,
			ServerAddr: serverAddr,
			ConfigFile: configFile,
			Model:      model,
			Password:   password,
		}
		if err := SaveConfig(); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
	}

	return nil
}

func rpcStopVnt() error {
	if vntRunning() {
		err := exec.Command("pkill", "-x", "vnt-cli").Run()
		if err != nil {
			return fmt.Errorf("failed to stop vnt: %w", err)
		}
	}

	config.VntAutoStart = false
	err := SaveConfig()
	if err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetVntStatus() (VntStatus, error) {
	return VntStatus{Running: vntRunning()}, nil
}

type WireguardStatus struct {
	Running bool `json:"running"`
}

var (
	wireguardLogPath  = "/tmp/wireguard.log"
	wireguardConfPath = "/etc/wireguard/wg0.conf"
)

func wireguardRunning() bool {
	cmd := exec.Command("ip", "link", "show", "wg0")
	return cmd.Run() == nil
}

func rpcGetWireguardLog() (string, error) {
	f, err := os.Open(wireguardLogPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("wireguard log file not exist")
		}
		return "", err
	}
	defer f.Close()

	const want = 30
	lines := make([]string, 0, want+10)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
		if len(lines) > want {
			lines = lines[1:]
		}
	}
	if err := sc.Err(); err != nil {
		return "", err
	}

	var buf []byte
	for _, l := range lines {
		buf = append(buf, l...)
		buf = append(buf, '\n')
	}
	return string(buf), nil
}

func rpcGetWireguardConfig() (WireguardConfig, error) {
	return config.WireguardConfig, nil
}

func rpcStartWireguard(configFile string) error {
	if wireguardRunning() {
		_ = exec.Command("wg-quick", "down", wireguardConfPath).Run()
	}

	if configFile == "" {
		return fmt.Errorf("wireguard config file is required")
	}

	_ = os.MkdirAll(filepath.Dir(wireguardConfPath), 0700)
	if err := os.WriteFile(wireguardConfPath, []byte(configFile), 0600); err != nil {
		return fmt.Errorf("failed to write wireguard config file: %w", err)
	}

	cmd := exec.Command("wg-quick", "up", wireguardConfPath)
	logFile, err := os.OpenFile(wireguardLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to open wireguard log file: %w", err)
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("start wireguard failed: %w", err)
	}

	config.WireguardAutoStart = true
	config.WireguardConfig.ConfigFile = configFile
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	return nil
}

func rpcStopWireguard() error {
	if wireguardRunning() {
		cmd := exec.Command("wg-quick", "down", wireguardConfPath)
		logFile, err := os.OpenFile(wireguardLogPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
		if err == nil {
			defer logFile.Close()
			cmd.Stdout = logFile
			cmd.Stderr = logFile
		}

		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to stop wireguard: %w", err)
		}
	}

	config.WireguardAutoStart = false
	if err := SaveConfig(); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}
	return nil
}

func rpcGetWireguardStatus() (WireguardStatus, error) {
	return WireguardStatus{Running: wireguardRunning()}, nil
}

func rpcGetWireguardInfo() (string, error) {
	cmd := exec.Command("wg", "show")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to get wireguard info: %w", err)
	}
	return string(output), nil
}

func initVPN() {
	waitVpnCtrlClientConnected()
	go func() {
		for {
			if !networkState.IsOnline() {
				vpnLogger.Warn().Msg("waiting for network to be online, will retry in 3 seconds")
				time.Sleep(3 * time.Second)
				continue
			} else {
				break
			}
		}

		if config.TailScaleAutoStart {
			if _, err := rpcLoginTailScale(config.TailScaleXEdge); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start TailScale")
			}
		}

		if config.ZeroTierAutoStart && config.ZeroTierNetworkID != "" {
			if _, err := rpcLoginZeroTier(config.ZeroTierNetworkID); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start ZeroTier")
			}
		}

		if config.FrpcAutoStart && config.FrpcToml != "" {
			if err := rpcStartFrpc(config.FrpcToml); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start frpc")
			}
		}

		if config.EasytierAutoStart && config.EasytierConfig.Name != "" && config.EasytierConfig.Secret != "" && config.EasytierConfig.Node != "" {
			if err := rpcStartEasyTier(config.EasytierConfig.Name, config.EasytierConfig.Secret, config.EasytierConfig.Node); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start easytier")
			}
		}

		if config.VntAutoStart {
			if config.VntConfig.ConfigMode == "file" && config.VntConfig.ConfigFile != "" {
				if err := rpcStartVnt("file", "", "", "", "", config.VntConfig.ConfigFile, config.VntConfig.Model, config.VntConfig.Password); err != nil {
					vpnLogger.Error().Err(err).Msg("Failed to auto start vnt (file mode)")
				}
			} else if config.VntConfig.Token != "" {
				if err := rpcStartVnt("params", config.VntConfig.Token, config.VntConfig.DeviceId, config.VntConfig.Name, config.VntConfig.ServerAddr, "", config.VntConfig.Model, config.VntConfig.Password); err != nil {
					vpnLogger.Error().Err(err).Msg("Failed to auto start vnt (params mode)")
				}
			}
		}

		if config.CloudflaredAutoStart && config.CloudflaredToken != "" {
			if err := rpcStartCloudflared(config.CloudflaredToken); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start cloudflared")
			}
		}

		if config.WireguardAutoStart && config.WireguardConfig.ConfigFile != "" {
			if err := rpcStartWireguard(config.WireguardConfig.ConfigFile); err != nil {
				vpnLogger.Error().Err(err).Msg("Failed to auto start wireguard")
			}
		}
	}()

	go func() {
		for {
			var status syscall.WaitStatus
			var rusage syscall.Rusage
			pid, err := syscall.Wait4(-1, &status, syscall.WNOHANG, &rusage)
			if pid <= 0 || err != nil {
				time.Sleep(5 * time.Second)
			}
		}
	}()
}
