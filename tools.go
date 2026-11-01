package kvm

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const vpnToolsRoot = "/userdata/vpn-tools"
const vntPinnedVersion = "v1.2.16"

type vpnToolSpec struct {
	Name          string
	Repo          string
	Binaries      []string
	VersionBinary string
	VersionFlags  [][]string
}

var vpnToolSpecs = map[string]vpnToolSpec{
	"frpc": {
		Name:          "frpc",
		Repo:          "fatedier/frp",
		Binaries:      []string{"frpc"},
		VersionBinary: "frpc",
		VersionFlags:  [][]string{{"-v"}, {"--version"}, {"version"}},
	},
	"easytier": {
		Name:          "easytier",
		Repo:          "EasyTier/EasyTier",
		Binaries:      []string{"easytier-core", "easytier-cli"},
		VersionBinary: "easytier-cli",
		VersionFlags:  [][]string{{"--version"}, {"-V"}, {"version"}},
	},
	"vnt": {
		Name:          "vnt",
		Repo:          "vnt-dev/vnt",
		Binaries:      []string{"vnt-cli"},
		VersionBinary: "vnt-cli",
		VersionFlags:  [][]string{{}, {"--version"}, {"-V"}, {"version"}},
	},
	"cloudflared": {
		Name:          "cloudflared",
		Repo:          "cloudflare/cloudflared",
		Binaries:      []string{"cloudflared"},
		VersionBinary: "cloudflared",
		VersionFlags:  [][]string{{"-v"}, {"version"}, {"--version"}},
	},
	"netbird": {
		Name:          "netbird",
		Repo:          "netbirdio/netbird",
		Binaries:      []string{"netbird"},
		VersionBinary: "netbird",
		VersionFlags:  [][]string{{"version"}},
	},
}

type VpnToolSystemInfo struct {
	GOOS         string   `json:"goos"`
	GOARCH       string   `json:"goarch"`
	UnameArch    string   `json:"uname_arch"`
	ArchLabel    string   `json:"arch_label"`
	ArchKeywords []string `json:"arch_keywords"`
}

type VpnToolStatus struct {
	Tool            string   `json:"tool"`
	Installed       bool     `json:"installed"`
	Source          string   `json:"source"`
	CurrentVersion  string   `json:"current_version"`
	DetectedVersion string   `json:"detected_version"`
	ManagedVersions []string `json:"managed_versions"`
}

type VpnToolReleaseAsset struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	ArchMatch bool   `json:"arch_match"`
}

type VpnToolRelease struct {
	TagName string                `json:"tag_name"`
	Assets  []VpnToolReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type githubRelease struct {
	TagName    string               `json:"tag_name"`
	Draft      bool                 `json:"draft"`
	Prerelease bool                 `json:"prerelease"`
	Assets     []githubReleaseAsset `json:"assets"`
}

type VpnToolInstallTask struct {
	Tool      string   `json:"tool"`
	Running   bool     `json:"running"`
	Progress  float64  `json:"progress"`
	Message   string   `json:"message"`
	Logs      []string `json:"logs"`
	Error     string   `json:"error"`
	Version   string   `json:"version"`
	UpdatedAt int64    `json:"updated_at"`
}

var (
	vpnToolInstallTaskMu sync.Mutex
	vpnToolInstallTasks  = map[string]*VpnToolInstallTask{}
)

func getVpnToolSpec(tool string) (vpnToolSpec, error) {
	spec, ok := vpnToolSpecs[strings.ToLower(strings.TrimSpace(tool))]
	if !ok {
		return vpnToolSpec{}, fmt.Errorf("unsupported vpn tool: %s", tool)
	}
	return spec, nil
}

func normalizeArchLabel(arch string) string {
	switch strings.ToLower(strings.TrimSpace(arch)) {
	case "x86_64", "amd64":
		return "amd64"
	case "aarch64", "arm64":
		return "arm64"
	case "armv7l", "armv7", "armhf":
		return "armv7"
	case "armv6l", "armv6":
		return "armv6"
	case "i386", "i686", "386", "x86":
		return "386"
	default:
		return strings.ToLower(strings.TrimSpace(arch))
	}
}

func archKeywords(archLabel string) []string {
	switch archLabel {
	case "amd64":
		return []string{"amd64", "x86_64", "x64"}
	case "arm64":
		return []string{"arm64", "aarch64"}
	case "armv7":
		return []string{"armv7", "armv7l", "armhf", "arm"}
	case "armv6":
		return []string{"armv6", "armv6l", "arm"}
	case "386":
		return []string{"386", "i386", "x86"}
	default:
		if archLabel == "" {
			return []string{}
		}
		return []string{archLabel}
	}
}

func rpcGetVpnToolSystemInfo() (VpnToolSystemInfo, error) {
	unameArch := runtime.GOARCH
	if out, err := exec.Command("uname", "-m").Output(); err == nil {
		unameArch = strings.TrimSpace(string(out))
	}
	archLabel := normalizeArchLabel(unameArch)
	if archLabel == "" {
		archLabel = normalizeArchLabel(runtime.GOARCH)
	}

	return VpnToolSystemInfo{
		GOOS:         runtime.GOOS,
		GOARCH:       runtime.GOARCH,
		UnameArch:    unameArch,
		ArchLabel:    archLabel,
		ArchKeywords: archKeywords(archLabel),
	}, nil
}

func vpnToolDir(spec vpnToolSpec) string {
	return filepath.Join(vpnToolsRoot, spec.Name)
}

func vpnToolVersionsDir(spec vpnToolSpec) string {
	return filepath.Join(vpnToolDir(spec), "versions")
}

func vpnToolCurrentDir(spec vpnToolSpec) string {
	return filepath.Join(vpnToolDir(spec), "current")
}

func managedBinaryPath(spec vpnToolSpec, binaryName string) string {
	return filepath.Join(vpnToolCurrentDir(spec), binaryName)
}

func findExecutablePath(binary string) (string, error) {
	if strings.Contains(binary, "/") {
		info, err := os.Stat(binary)
		if err != nil {
			return "", err
		}
		if info.Mode().IsRegular() || (info.Mode()&os.ModeSymlink) != 0 {
			return binary, nil
		}
		return "", fmt.Errorf("not executable file: %s", binary)
	}
	return exec.LookPath(binary)
}

func resolveVpnToolBinary(tool, defaultBinary string) string {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return defaultBinary
	}
	managed := managedBinaryPath(spec, defaultBinary)
	if _, err := os.Stat(managed); err == nil {
		return managed
	}
	return defaultBinary
}

func detectCommandVersion(binaryPath string, flags [][]string) string {
	for _, args := range flags {
		cmd := exec.Command(binaryPath, args...)
		out, err := cmd.CombinedOutput()
		if err != nil && len(out) == 0 {
			continue
		}
		line := extractVersionLine(string(out))
		if line != "" {
			return line
		}
	}
	return ""
}

func extractVersionLine(output string) string {
	normalized := strings.ReplaceAll(output, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	// Prefer explicit version lines to handle tools like vnt-cli
	// where the first line is usage text.
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.Contains(lower, "version:") {
			return line
		}
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		lower := strings.ToLower(line)
		if strings.Contains(lower, "version") || strings.HasPrefix(lower, "v") {
			return line
		}
	}

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line != "" {
			return line
		}
	}
	return ""
}

func listManagedVersions(spec vpnToolSpec) []string {
	versionsDir := vpnToolVersionsDir(spec)
	entries, err := os.ReadDir(versionsDir)
	if err != nil {
		return []string{}
	}
	versions := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			versions = append(versions, e.Name())
		}
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i] > versions[j] })
	return versions
}

func currentManagedVersion(spec vpnToolSpec) string {
	currentDir := vpnToolCurrentDir(spec)
	for _, binary := range spec.Binaries {
		p := filepath.Join(currentDir, binary)
		target, err := os.Readlink(p)
		if err != nil {
			continue
		}
		abs := target
		if !filepath.IsAbs(target) {
			abs = filepath.Clean(filepath.Join(filepath.Dir(p), target))
		}
		versionsRoot := vpnToolVersionsDir(spec) + string(os.PathSeparator)
		if strings.HasPrefix(abs, versionsRoot) {
			rel := strings.TrimPrefix(abs, versionsRoot)
			parts := strings.Split(rel, string(os.PathSeparator))
			if len(parts) > 0 && parts[0] != "" {
				return parts[0]
			}
		}
	}
	return ""
}

func initVpnToolInstallTask(tool, version string) {
	vpnToolInstallTaskMu.Lock()
	defer vpnToolInstallTaskMu.Unlock()
	vpnToolInstallTasks[tool] = &VpnToolInstallTask{
		Tool:      tool,
		Running:   true,
		Progress:  0,
		Message:   "preparing",
		Logs:      []string{"Preparing install task..."},
		Error:     "",
		Version:   version,
		UpdatedAt: time.Now().Unix(),
	}
}

func updateVpnToolInstallTask(tool string, progress float64, message string) {
	vpnToolInstallTaskMu.Lock()
	defer vpnToolInstallTaskMu.Unlock()
	task, ok := vpnToolInstallTasks[tool]
	if !ok {
		return
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 1 {
		progress = 1
	}
	task.Progress = progress
	if strings.TrimSpace(message) != "" {
		task.Message = message
	}
	task.UpdatedAt = time.Now().Unix()
}

func appendVpnToolInstallLog(tool, line string) {
	vpnToolInstallTaskMu.Lock()
	defer vpnToolInstallTaskMu.Unlock()
	task, ok := vpnToolInstallTasks[tool]
	if !ok {
		return
	}
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}
	task.Logs = append(task.Logs, line)
	if len(task.Logs) > 200 {
		task.Logs = task.Logs[len(task.Logs)-200:]
	}
	task.UpdatedAt = time.Now().Unix()
}

func finishVpnToolInstallTask(tool string, err error) {
	vpnToolInstallTaskMu.Lock()
	defer vpnToolInstallTaskMu.Unlock()
	task, ok := vpnToolInstallTasks[tool]
	if !ok {
		return
	}
	task.Running = false
	task.UpdatedAt = time.Now().Unix()
	if err != nil {
		task.Error = err.Error()
		task.Message = "failed"
		task.Logs = append(task.Logs, "Install failed: "+err.Error())
		return
	}
	task.Progress = 1
	task.Message = "completed"
	task.Error = ""
	task.Logs = append(task.Logs, "Install completed.")
}

func rpcGetVpnToolInstallTask(tool string) (VpnToolInstallTask, error) {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return VpnToolInstallTask{}, err
	}
	_ = spec
	vpnToolInstallTaskMu.Lock()
	defer vpnToolInstallTaskMu.Unlock()
	task, ok := vpnToolInstallTasks[tool]
	if !ok {
		return VpnToolInstallTask{
			Tool:      tool,
			Running:   false,
			Progress:  0,
			Message:   "",
			Logs:      []string{},
			Error:     "",
			Version:   "",
			UpdatedAt: time.Now().Unix(),
		}, nil
	}
	cp := *task
	cp.Logs = append([]string{}, task.Logs...)
	return cp, nil
}

func rpcGetVpnToolStatus(tool string) (VpnToolStatus, error) {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return VpnToolStatus{}, err
	}

	status := VpnToolStatus{
		Tool:            spec.Name,
		Installed:       false,
		Source:          "none",
		CurrentVersion:  currentManagedVersion(spec),
		DetectedVersion: "",
		ManagedVersions: listManagedVersions(spec),
	}

	primaryBinary := spec.Binaries[0]
	versionBinary := spec.VersionBinary
	if strings.TrimSpace(versionBinary) == "" {
		versionBinary = primaryBinary
	}

	managedPrimary := managedBinaryPath(spec, primaryBinary)
	managedVersionBinary := managedBinaryPath(spec, versionBinary)
	if _, err := os.Stat(managedPrimary); err == nil {
		status.Installed = true
		status.Source = "managed"
		status.DetectedVersion = detectCommandVersion(managedVersionBinary, spec.VersionFlags)
		if status.CurrentVersion == "" {
			status.CurrentVersion = "managed"
		}
		return status, nil
	}

	primaryLookedUp, primaryErr := findExecutablePath(primaryBinary)
	if primaryErr == nil {
		status.Installed = true
		status.Source = "system"
		_ = primaryLookedUp
		versionLookedUp, versionErr := findExecutablePath(versionBinary)
		if versionErr == nil {
			status.DetectedVersion = detectCommandVersion(versionLookedUp, spec.VersionFlags)
		}
	}
	return status, nil
}

func rpcListVpnToolReleases(tool string) ([]VpnToolRelease, error) {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return nil, err
	}
	systemInfo, err := rpcGetVpnToolSystemInfo()
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=20", spec.Repo)
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		apiURL,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to build release request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "kvm-vpn-tool-manager")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("fetch releases failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var ghReleases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&ghReleases); err != nil {
		return nil, fmt.Errorf("failed to parse release json: %w", err)
	}

	keywords := systemInfo.ArchKeywords
	results := make([]VpnToolRelease, 0, len(ghReleases))
	for _, rel := range ghReleases {
		if rel.Draft {
			continue
		}
		if spec.Name == "vnt" {
			tag := strings.TrimSpace(rel.TagName)
			if tag != vntPinnedVersion && tag != strings.TrimPrefix(vntPinnedVersion, "v") {
				continue
			}
		}
		releaseItem := VpnToolRelease{
			TagName: strings.TrimSpace(rel.TagName),
			Assets:  make([]VpnToolReleaseAsset, 0, len(rel.Assets)),
		}
		for _, asset := range rel.Assets {
			nameLower := strings.ToLower(strings.TrimSpace(asset.Name))
			isLinux := strings.Contains(nameLower, "linux")
			archMatch := false
			for _, kw := range keywords {
				if strings.Contains(nameLower, strings.ToLower(kw)) {
					archMatch = true
					break
				}
			}
			if !isLinux {
				archMatch = false
			}
			releaseItem.Assets = append(releaseItem.Assets, VpnToolReleaseAsset{
				Name:      asset.Name,
				URL:       strings.TrimSpace(asset.BrowserDownloadURL),
				ArchMatch: archMatch,
			})
		}
		if releaseItem.TagName != "" {
			results = append(results, releaseItem)
		}
	}
	return results, nil
}

func downloadFileToPath(url, targetPath string, onProgress func(downloaded int64, total int64)) error {
	if strings.TrimSpace(url) == "" {
		return fmt.Errorf("empty download url")
	}
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		url,
		nil,
	)
	if err != nil {
		return fmt.Errorf("failed to create download request: %w", err)
	}
	req.Header.Set("User-Agent", "kvm-vpn-tool-manager")
	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("download failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	out, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create target file: %w", err)
	}
	defer out.Close()
	total := resp.ContentLength
	var downloaded int64
	buf := make([]byte, 64*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			written, writeErr := out.Write(buf[:n])
			if writeErr != nil {
				return fmt.Errorf("failed to write target file: %w", writeErr)
			}
			if written != n {
				return fmt.Errorf("short write while saving downloaded file")
			}
			downloaded += int64(n)
			if onProgress != nil {
				onProgress(downloaded, total)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("failed to read download stream: %w", readErr)
		}
	}
	return nil
}

func extractFromTarGz(archivePath string, targetBinaryNames []string, outDir string) (map[string]bool, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	gzReader, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer gzReader.Close()
	tr := tar.NewReader(gzReader)

	need := make(map[string]bool, len(targetBinaryNames))
	found := make(map[string]bool, len(targetBinaryNames))
	for _, b := range targetBinaryNames {
		need[b] = true
		found[b] = false
	}

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return found, err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		base := filepath.Base(hdr.Name)
		if !need[base] {
			continue
		}
		dstPath := filepath.Join(outDir, base)
		dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return found, err
		}
		if _, err := io.Copy(dst, tr); err != nil {
			dst.Close()
			return found, err
		}
		if err := dst.Close(); err != nil {
			return found, err
		}
		found[base] = true
	}
	return found, nil
}

func extractFromZip(archivePath string, targetBinaryNames []string, outDir string) (map[string]bool, error) {
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, err
	}
	defer zr.Close()

	need := make(map[string]bool, len(targetBinaryNames))
	found := make(map[string]bool, len(targetBinaryNames))
	for _, b := range targetBinaryNames {
		need[b] = true
		found[b] = false
	}

	for _, f := range zr.File {
		base := filepath.Base(f.Name)
		if !need[base] {
			continue
		}
		src, err := f.Open()
		if err != nil {
			return found, err
		}
		dstPath := filepath.Join(outDir, base)
		dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			src.Close()
			return found, err
		}
		if _, err := io.Copy(dst, src); err != nil {
			src.Close()
			dst.Close()
			return found, err
		}
		src.Close()
		if err := dst.Close(); err != nil {
			return found, err
		}
		found[base] = true
	}
	return found, nil
}

func ensureBinariesInstalled(found map[string]bool, required []string) error {
	missing := make([]string, 0)
	for _, b := range required {
		if !found[b] {
			missing = append(missing, b)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("required binaries are missing in package: %s", strings.Join(missing, ", "))
	}
	return nil
}

func setupCurrentSymlinks(spec vpnToolSpec, version string) error {
	currentDir := vpnToolCurrentDir(spec)
	versionDir := filepath.Join(vpnToolVersionsDir(spec), version)
	if err := os.MkdirAll(currentDir, 0755); err != nil {
		return err
	}
	for _, b := range spec.Binaries {
		currentLink := filepath.Join(currentDir, b)
		_ = os.Remove(currentLink)
		target := filepath.Join(versionDir, b)
		if err := os.Symlink(target, currentLink); err != nil {
			return fmt.Errorf("failed to update current binary symlink for %s: %w", b, err)
		}
	}
	return nil
}

func rpcInstallVpnTool(tool, version, assetName, downloadURL string) error {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return err
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return fmt.Errorf("version is required")
	}
	if spec.Name == "vnt" && version != vntPinnedVersion && version != strings.TrimPrefix(vntPinnedVersion, "v") {
		return fmt.Errorf("vnt install is temporarily pinned to %s", vntPinnedVersion)
	}
	downloadURL = strings.TrimSpace(downloadURL)
	if downloadURL == "" {
		return fmt.Errorf("downloadURL is required")
	}

	versionDir := filepath.Join(vpnToolVersionsDir(spec), version)
	appendVpnToolInstallLog(tool, "Preparing version directory...")
	updateVpnToolInstallTask(tool, 0.05, "preparing")
	if err := os.MkdirAll(versionDir, 0755); err != nil {
		return fmt.Errorf("failed to create version directory: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "vpn-tool-*")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	appendVpnToolInstallLog(tool, "Downloading release package...")
	if err := downloadFileToPath(downloadURL, tmpPath, func(downloaded int64, total int64) {
		if total > 0 {
			ratio := float64(downloaded) / float64(total)
			updateVpnToolInstallTask(tool, 0.1+ratio*0.65, "downloading")
			return
		}
		// Unknown total size, keep showing progress moving slowly.
		updateVpnToolInstallTask(tool, 0.4, "downloading")
	}); err != nil {
		return err
	}
	appendVpnToolInstallLog(tool, "Download completed.")

	assetLower := strings.ToLower(strings.TrimSpace(assetName))
	if assetLower == "" {
		assetLower = strings.ToLower(strings.TrimSpace(downloadURL))
	}

	found := map[string]bool{}
	updateVpnToolInstallTask(tool, 0.8, "extracting")
	appendVpnToolInstallLog(tool, "Extracting package...")
	switch {
	case strings.HasSuffix(assetLower, ".tar.gz") || strings.HasSuffix(assetLower, ".tgz"):
		found, err = extractFromTarGz(tmpPath, spec.Binaries, versionDir)
		if err != nil {
			return fmt.Errorf("failed to extract tar.gz: %w", err)
		}
	case strings.HasSuffix(assetLower, ".zip"):
		found, err = extractFromZip(tmpPath, spec.Binaries, versionDir)
		if err != nil {
			return fmt.Errorf("failed to extract zip: %w", err)
		}
	default:
		if len(spec.Binaries) != 1 {
			return fmt.Errorf("single binary install is not supported for %s", spec.Name)
		}
		dstPath := filepath.Join(versionDir, spec.Binaries[0])
		input, err := os.Open(tmpPath)
		if err != nil {
			return err
		}
		defer input.Close()
		output, err := os.OpenFile(dstPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		if _, err := io.Copy(output, input); err != nil {
			output.Close()
			return err
		}
		if err := output.Close(); err != nil {
			return err
		}
		found[spec.Binaries[0]] = true
	}

	appendVpnToolInstallLog(tool, "Validating installed binaries...")
	updateVpnToolInstallTask(tool, 0.92, "validating")
	if err := ensureBinariesInstalled(found, spec.Binaries); err != nil {
		return err
	}
	appendVpnToolInstallLog(tool, "Switching to installed version...")
	updateVpnToolInstallTask(tool, 0.97, "activating")
	if err := setupCurrentSymlinks(spec, version); err != nil {
		return err
	}
	updateVpnToolInstallTask(tool, 1, "completed")
	return nil
}

func rpcStartVpnToolInstall(tool, version, assetName, downloadURL string) error {
	_, err := getVpnToolSpec(tool)
	if err != nil {
		return err
	}

	vpnToolInstallTaskMu.Lock()
	if task, ok := vpnToolInstallTasks[tool]; ok && task.Running {
		vpnToolInstallTaskMu.Unlock()
		return fmt.Errorf("install task is already running for %s", tool)
	}
	vpnToolInstallTaskMu.Unlock()

	initVpnToolInstallTask(tool, version)
	go func() {
		err := rpcInstallVpnTool(tool, version, assetName, downloadURL)
		finishVpnToolInstallTask(tool, err)
	}()
	return nil
}

func rpcUseVpnToolVersion(tool, version string) error {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return err
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return fmt.Errorf("version is required")
	}
	versionDir := filepath.Join(vpnToolVersionsDir(spec), version)
	info, err := os.Stat(versionDir)
	if err != nil {
		return fmt.Errorf("version is not installed: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("invalid version directory")
	}
	for _, b := range spec.Binaries {
		if _, err := os.Stat(filepath.Join(versionDir, b)); err != nil {
			return fmt.Errorf("binary %s is missing in version %s", b, version)
		}
	}
	return setupCurrentSymlinks(spec, version)
}

func rpcUninstallVpnToolVersion(tool, version string) error {
	spec, err := getVpnToolSpec(tool)
	if err != nil {
		return err
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return fmt.Errorf("version is required")
	}
	versionDir := filepath.Join(vpnToolVersionsDir(spec), version)
	if err := os.RemoveAll(versionDir); err != nil {
		return fmt.Errorf("failed to uninstall version: %w", err)
	}
	if currentManagedVersion(spec) == version {
		currentDir := vpnToolCurrentDir(spec)
		for _, b := range spec.Binaries {
			_ = os.Remove(filepath.Join(currentDir, b))
		}
	}

	remaining := listManagedVersions(spec)
	if len(remaining) > 0 {
		// Automatically switch to latest remaining managed version.
		if err := setupCurrentSymlinks(spec, remaining[0]); err != nil {
			return err
		}
	}
	return nil
}
