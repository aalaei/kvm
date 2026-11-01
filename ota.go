package kvm

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/gin-gonic/gin"
	"github.com/gwatts/rootcerts"
	"github.com/rs/zerolog"
)

type UpdateMetadata struct {
	AppVersion    string `json:"appVersion"`
	AppUrl        string `json:"appUrl"`
	AppHash       string `json:"appHash"`
	SystemVersion string `json:"systemVersion"`
	SystemUrl     string `json:"systemUrl"`
	SystemHash    string `json:"systemHash"`
}

type LocalMetadata struct {
	AppVersion    string `json:"appVersion"`
	SystemVersion string `json:"systemVersion"`
}

type LocalPackageInfo struct {
	AppVersion    string `json:"appVersion"`
	SystemVersion string `json:"systemVersion"`
	HasApp        bool   `json:"hasApp"`
	HasSystem     bool   `json:"hasSystem"`
}

func GetLocalPackageInfo() (*LocalPackageInfo, error) {
	pkgDir := localPackageDir
	// Read version.txt
	versionPath := filepath.Join(pkgDir, "version.txt")
	data, err := os.ReadFile(versionPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read version.txt: %w", err)
	}

	// Parse version.txt
	appVersion, systemVersion, err := parseVersionTxt(string(data))
	if err != nil {
		return nil, fmt.Errorf("failed to parse version.txt: %w", err)
	}

	// Check if firmware files exist
	_, appErr := os.Stat(filepath.Join(pkgDir, "kvm_app"))
	_, sysErr := os.Stat(filepath.Join(pkgDir, "update_system.zip"))

	return &LocalPackageInfo{
		AppVersion:    appVersion,
		SystemVersion: systemVersion,
		HasApp:        appErr == nil,
		HasSystem:     sysErr == nil,
	}, nil
}

type RemoteMetadata struct {
	AppVersion    string `json:"appVersion"`
	AppUrl        string `json:"appUrl"`
	AppHash       string `json:"appHash"`
	AppSigUrl     string `json:"appSigUrl,omitempty"`
	SystemUrl     string `json:"systemUrl"`
	SystemHash    string `json:"systemHash,omitempty"`
	SystemSigUrl  string `json:"systemSigUrl,omitempty"`
	SystemVersion string `json:"systemVersion"`
}

// UpdateStatus represents the current update status
type UpdateStatus struct {
	Local                  *LocalMetadata  `json:"local"`
	Remote                 *RemoteMetadata `json:"remote"`
	SystemUpdateAvailable  bool            `json:"systemUpdateAvailable"`
	AppUpdateAvailable     bool            `json:"appUpdateAvailable"`
	AppSignatureMissing    bool            `json:"appSignatureMissing,omitempty"`
	SystemSignatureMissing bool            `json:"systemSignatureMissing,omitempty"`

	// for backwards compatibility
	Error string `json:"error,omitempty"`
}

var UpdateGithubAppReleaseUrls = []string{
	"https://api.github.com/repos/LuckfoxTECH/kvm/releases/latest",
	"https://api.github.com/repos/LuckfoxTECH/kvm_app/releases/latest",
	"https://api.github.com/repos/luckfox-eng29/kvm/releases/latest",
	"https://api.github.com/repos/luckfox-eng29/kvm_app/releases/latest",
}

var UpdateGiteeAppReleaseUrls = []string{
	"https://gitee.com/api/v5/repos/LuckfoxTECH/kvm/releases/latest",
	"https://gitee.com/api/v5/repos/LuckfoxTECH/kvm_app/releases/latest",
	"https://gitee.com/api/v5/repos/luckfox-eng29/kvm/releases/latest",
	"https://gitee.com/api/v5/repos/luckfox-eng29/kvm_app/releases/latest",
}

var UpdateGithubSystemReleaseUrls = []string{
	"https://api.github.com/repos/LuckfoxTECH/kvm_system/releases/latest",
	"https://api.github.com/repos/luckfox-eng29/kvm_system/releases/latest",
}

var UpdateGiteeSystemReleaseUrls = []string{
	"https://gitee.com/api/v5/repos/LuckfoxTECH/kvm_system/releases/latest",
	"https://gitee.com/api/v5/repos/luckfox-eng29/kvm_system/releases/latest",
}

var UpdateGiteeSystemZipUrls = []string{
	"https://gitee.com/LuckfoxTECH/kvm_system/archive/refs/tags/",
	"https://gitee.com/luckfox-eng29/kvm_system/archive/refs/tags/",
}

const cdnUpdateBaseURL = "https://cdn.picokvm.top/luckfox_picokvm_firmware/lastest/"

var builtAppVersion = "0.1.4+dev"

var (
	updateSource        = "github"
	customUpdateBaseURL string
)

const (
	updateSourceGithub = "github"
	updateSourceGitee  = "gitee"
	updateSourceCDN    = "cdn"
	updateSourceCustom = "custom"
	updateSourceLocal  = "local"
	localPackageDir    = "/userdata/picokvm/ota_local_pkg"
)

// otaUploadMutex prevents concurrent uploads and updates
var otaUploadMutex sync.Mutex

func rpcSetUpdateSource(source string) error {
	switch source {
	case updateSourceGithub, updateSourceGitee, updateSourceCDN, updateSourceCustom, updateSourceLocal:
	default:
		return fmt.Errorf("invalid update source: %s", source)
	}
	updateSource = source
	return nil
}

func GetLocalVersion() (systemVersion *semver.Version, appVersion *semver.Version, err error) {
	appVersion, err = semver.NewVersion(builtAppVersion)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid built-in app version: %w", err)
	}

	systemVersionBytes, err := os.ReadFile("/version")
	if err != nil {
		return nil, appVersion, fmt.Errorf("error reading system version: %w", err)
	}

	systemVersion, err = semver.NewVersion(strings.TrimSpace(string(systemVersionBytes)))
	if err != nil {
		return nil, appVersion, fmt.Errorf("invalid system version: %w", err)
	}

	return systemVersion, appVersion, nil
}

func fetchUpdateMetadata(ctx context.Context, deviceId string) (*RemoteMetadata, error) {
	if updateSource == updateSourceCDN || updateSource == updateSourceCustom {
		baseURL := cdnUpdateBaseURL
		if updateSource == updateSourceCustom {
			if strings.TrimSpace(customUpdateBaseURL) == "" {
				return nil, fmt.Errorf("custom update base URL is not set")
			}
			baseURL = customUpdateBaseURL
		}
		return fetchUpdateMetadataFromBaseURL(ctx, baseURL)
	}

	_ = deviceId

	appVersionRemote, appURL, appSha256, appSigURL, err := fetchKvmAppLatestRelease(ctx)
	if err != nil {
		return nil, err
	}

	systemVersionRemote, systemZipURL, systemSigURL, err := fetchKvmSystemLatestRelease(ctx)
	if err != nil {
		return nil, err
	}

	return &RemoteMetadata{
		AppUrl:        appURL,
		AppVersion:    appVersionRemote,
		AppHash:       appSha256,
		AppSigUrl:     appSigURL,
		SystemUrl:     systemZipURL,
		SystemVersion: systemVersionRemote,
		SystemSigUrl:  systemSigURL,
	}, nil
}

func fetchKvmAppLatestRelease(ctx context.Context) (tag string, downloadURL string, sha256 string, sigURL string, err error) {
	apiURLs := UpdateGithubAppReleaseUrls
	fallbackToGithub := false
	if updateSource == updateSourceGitee {
		apiURLs = UpdateGiteeAppReleaseUrls
		fallbackToGithub = true
	}

	tryFetch := func(urls []string) (string, string, string, string, error) {
		var lastErr error
		for _, apiURL := range urls {
			req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
			if err != nil {
				lastErr = fmt.Errorf("failed to create release request for %s: %w", apiURL, err)
				continue
			}

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				lastErr = fmt.Errorf("failed to fetch release from %s: %w", apiURL, err)
				continue
			}

			output, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				lastErr = fmt.Errorf("failed to read release response from %s: %w", apiURL, readErr)
				continue
			}

			if resp.StatusCode != http.StatusOK {
				lastErr = fmt.Errorf(
					"failed to fetch release from %s: status %d: %s",
					apiURL,
					resp.StatusCode,
					strings.TrimSpace(string(output)),
				)
				continue
			}

			var release struct {
				TagName string         `json:"tag_name"`
				Assets  []releaseAsset `json:"assets"`
			}
			if err := json.Unmarshal(output, &release); err != nil {
				lastErr = fmt.Errorf("failed to parse releases JSON from %s: %w", apiURL, err)
				continue
			}

			tag := strings.TrimSpace(release.TagName)
			if tag == "" {
				lastErr = fmt.Errorf("empty tag_name from %s", apiURL)
				continue
			}

			var downloadURL, sha256, sigURL string
			for _, asset := range release.Assets {
				name := strings.ToLower(strings.TrimSpace(asset.Name))
				u := strings.TrimSpace(asset.BrowserDownloadURL)
				if strings.HasSuffix(name, ".sig") || strings.HasSuffix(name, ".sha256") || strings.HasSuffix(name, ".sha2565") {
					if strings.HasSuffix(name, ".sig") && sigURL == "" {
						sigURL = u
					}
					continue
				}
				if downloadURL == "" {
					downloadURL = u
					sha256 = strings.TrimPrefix(strings.TrimSpace(asset.Digest), "sha256:")
				}
			}

			if strings.TrimSpace(downloadURL) == "" {
				lastErr = fmt.Errorf("empty app download url from %s", apiURL)
				continue
			}

			return tag, downloadURL, sha256, sigURL, nil
		}

		if lastErr == nil {
			lastErr = fmt.Errorf("no app release API URLs configured")
		}
		return "", "", "", "", lastErr
	}

	var lastErr error
	tag, downloadURL, sha256, sigURL, err = tryFetch(apiURLs)
	if err == nil {
		return tag, downloadURL, sha256, sigURL, nil
	}

	lastErr = err
	if updateSource == updateSourceGitee && fallbackToGithub {
		var ghSigURL string
		tag, downloadURL, sha256, ghSigURL, err = tryFetch(UpdateGithubAppReleaseUrls)
		if err == nil {
			downloadURL = strings.Replace(downloadURL, "github.com", "gitee.com", 1)
			ghSigURL = strings.Replace(ghSigURL, "github.com", "gitee.com", 1)
			return tag, downloadURL, sha256, ghSigURL, nil
		}
		lastErr = fmt.Errorf("gitee app release fetch failed (%v); github fallback failed (%w)", lastErr, err)
	}
	return "", "", "", "", lastErr
}

type releaseAsset struct {
	BrowserDownloadURL string `json:"browser_download_url"`
	Name               string `json:"name"`
	Digest             string `json:"digest"`
}

func pickZipAssetURL(assets []releaseAsset) string {
	for _, a := range assets {
		u := strings.TrimSpace(a.BrowserDownloadURL)
		if u == "" {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(a.Name))
		if strings.HasSuffix(name, ".zip") || strings.HasSuffix(strings.ToLower(u), ".zip") {
			return u
		}
	}
	if len(assets) == 1 {
		return strings.TrimSpace(assets[0].BrowserDownloadURL)
	}
	return ""
}

func fetchKvmSystemLatestRelease(ctx context.Context) (tag string, zipURL string, sigURL string, err error) {
	apiURLs := UpdateGithubSystemReleaseUrls
	fallbackToGithub := false
	if updateSource == updateSourceGitee {
		apiURLs = UpdateGiteeSystemReleaseUrls
		fallbackToGithub = true
	}

	var lastErr error
	for _, apiURL := range apiURLs {
		req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
		if err != nil {
			lastErr = fmt.Errorf("error creating system release request: %w", err)
			continue
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("error fetching system release: %w", err)
			continue
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("error reading system release response: %w", readErr)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf(
				"unexpected status code fetching system release from %s: %d, %s",
				apiURL,
				resp.StatusCode,
				strings.TrimSpace(string(body)),
			)
			continue
		}

		var release struct {
			TagName    string         `json:"tag_name"`
			ZipballURL string         `json:"zipball_url"`
			Assets     []releaseAsset `json:"assets"`
		}
		if err := json.Unmarshal(body, &release); err != nil {
			lastErr = fmt.Errorf("error parsing system release JSON from %s: %w", apiURL, err)
			continue
		}

		tag := strings.TrimSpace(release.TagName)
		if tag == "" {
			lastErr = fmt.Errorf("empty system tag_name from %s", apiURL)
			continue
		}

		var sysSigURL string
		for _, asset := range release.Assets {
			name := strings.ToLower(strings.TrimSpace(asset.Name))
			if strings.HasSuffix(name, ".sig") && sysSigURL == "" {
				sysSigURL = strings.TrimSpace(asset.BrowserDownloadURL)
			}
		}
		if u := pickZipAssetURL(release.Assets); strings.TrimSpace(u) != "" {
			return tag, strings.TrimSpace(u), sysSigURL, nil
		}
		if strings.TrimSpace(release.ZipballURL) != "" {
			return tag, strings.TrimSpace(release.ZipballURL), sysSigURL, nil
		}

		lastErr = fmt.Errorf("no usable system archive url in release response from %s", apiURL)
		continue
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("no system release API URLs configured")
	}
	if updateSource == updateSourceGitee && fallbackToGithub {
		var githubErr error
		var githubTag string
		var githubZipURL string
		for i, apiURL := range UpdateGithubSystemReleaseUrls {
			githubTag, githubZipURL, _, githubErr = func(apiURL string) (string, string, string, error) {
				req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
				if err != nil {
					return "", "", "", fmt.Errorf("error creating system release request: %w", err)
				}
				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					return "", "", "", fmt.Errorf("error fetching system release: %w", err)
				}
				body, readErr := io.ReadAll(resp.Body)
				resp.Body.Close()
				if readErr != nil {
					return "", "", "", fmt.Errorf("error reading system release response: %w", readErr)
				}
				if resp.StatusCode != http.StatusOK {
					return "", "", "", fmt.Errorf(
						"unexpected status code fetching system release from %s: %d, %s",
						apiURL,
						resp.StatusCode,
						strings.TrimSpace(string(body)),
					)
				}
				var release struct {
					TagName    string         `json:"tag_name"`
					ZipballURL string         `json:"zipball_url"`
					Assets     []releaseAsset `json:"assets"`
				}
				if err := json.Unmarshal(body, &release); err != nil {
					return "", "", "", fmt.Errorf("error parsing system release JSON from %s: %w", apiURL, err)
				}
				tag := strings.TrimSpace(release.TagName)
				if tag == "" {
					return "", "", "", fmt.Errorf("empty system tag_name from %s", apiURL)
				}
				var sigURL string
				for _, asset := range release.Assets {
					name := strings.ToLower(strings.TrimSpace(asset.Name))
					if strings.HasSuffix(name, ".sig") && sigURL == "" {
						sigURL = strings.TrimSpace(asset.BrowserDownloadURL)
					}
				}
				if u := pickZipAssetURL(release.Assets); strings.TrimSpace(u) != "" {
					return tag, strings.TrimSpace(u), sigURL, nil
				}
				if strings.TrimSpace(release.ZipballURL) != "" {
					return tag, strings.TrimSpace(release.ZipballURL), sigURL, nil
				}
				return "", "", "", fmt.Errorf("no usable system archive url in release response from %s", apiURL)
			}(apiURL)
			if githubErr == nil && strings.TrimSpace(githubTag) != "" {
				_ = githubZipURL
				selectedZipURL := ""
				if i < len(UpdateGiteeSystemZipUrls) {
					selectedZipURL = UpdateGiteeSystemZipUrls[i]
				} else if len(UpdateGiteeSystemZipUrls) > 0 {
					selectedZipURL = UpdateGiteeSystemZipUrls[0]
				}
				if strings.TrimSpace(selectedZipURL) != "" {
					zipTag := strings.TrimSpace(githubTag)
					if v, parseErr := semver.NewVersion(zipTag); parseErr == nil && v != nil {
						zipTag = v.String()
					} else {
						zipTag = strings.TrimPrefix(zipTag, "v")
						zipTag = strings.TrimPrefix(zipTag, "V")
					}
					zipURL := strings.TrimRight(selectedZipURL, "/") + "/" + zipTag + ".zip"
					return githubTag, zipURL, "", nil
				}
				githubErr = fmt.Errorf("no gitee system zip urls configured")
				break
			}
		}
		return "", "", "", fmt.Errorf("gitee system release fetch failed (%v); github fallback failed (%w)", lastErr, githubErr)
	}
	return "", "", "", lastErr
}

func fetchUpdateMetadataFromBaseURL(ctx context.Context, baseURL string) (*RemoteMetadata, error) {
	baseURL = normalizeBaseURL(baseURL)
	versionURL, err := resolveURL(baseURL, "version.txt")
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "GET", versionURL, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	client := http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			TLSHandshakeTimeout: 30 * time.Second,
			TLSClientConfig: &tls.Config{
				RootCAs: rootcerts.ServerCertPool(),
			},
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error fetching version.txt: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code fetching version.txt: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading version.txt: %w", err)
	}

	appVersion, systemVersion, err := parseVersionTxt(string(body))
	if err != nil {
		return nil, err
	}

	appURL, err := resolveURL(baseURL, "kvm_app")
	if err != nil {
		return nil, err
	}

	appHash, err := fetchFirstSHA256FromBaseURL(ctx, baseURL, []string{"kvm_app.sha2565", "kvm_app.sha256"})
	if err != nil {
		return nil, err
	}

	systemURL, err := resolveURL(baseURL, "update_system.zip")
	if err != nil {
		return nil, err
	}
	systemHash, err := fetchFirstSHA256FromBaseURL(ctx, baseURL, []string{"update_system.zip.sha2565", "update_system.zip.sha256"})
	if err != nil {
		var urlErr error
		systemURL, urlErr = resolveURL(baseURL, "update_system.tar")
		if urlErr != nil {
			return nil, err
		}
		var hashErr error
		systemHash, hashErr = fetchFirstSHA256FromBaseURL(ctx, baseURL, []string{"update_system.tar.sha256"})
		if hashErr != nil {
			return nil, err
		}
	}

	appSigURL, _ := resolveURL(baseURL, "kvm_app.sig")
	systemSigURL, _ := resolveURL(baseURL, "update_system.zip.sig")
	if strings.HasSuffix(systemURL, ".tar") {
		systemSigURL, _ = resolveURL(baseURL, "update_system.tar.sig")
	}

	return &RemoteMetadata{
		AppVersion:    appVersion,
		AppUrl:        appURL,
		AppHash:       appHash,
		AppSigUrl:     appSigURL,
		SystemVersion: systemVersion,
		SystemUrl:     systemURL,
		SystemHash:    systemHash,
		SystemSigUrl:  systemSigURL,
	}, nil
}

func extractUpdateSystemTarFromZip(zipPath string, tarPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open update_system.zip: %w", err)
	}
	defer r.Close()

	var tarFile *zip.File
	for _, f := range r.File {
		if strings.TrimSpace(f.Name) == "" {
			continue
		}
		if filepath.Base(f.Name) == "update_system.tar" {
			tarFile = f
			break
		}
	}
	if tarFile == nil {
		return fmt.Errorf("update_system.tar not found in %s", zipPath)
	}

	rc, err := tarFile.Open()
	if err != nil {
		return fmt.Errorf("failed to open update_system.tar in zip: %w", err)
	}
	defer rc.Close()

	tmpPath := tarPath + ".tmp"
	_ = os.Remove(tmpPath)
	out, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("failed to create %s: %w", tmpPath, err)
	}
	_, copyErr := io.Copy(out, rc)
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to extract update_system.tar: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to close %s: %w", tmpPath, closeErr)
	}

	_ = os.Remove(tarPath)
	if err := os.Rename(tmpPath, tarPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to move extracted tar: %w", err)
	}
	return nil
}

func fetchFirstSHA256FromBaseURL(ctx context.Context, baseURL string, candidates []string) (string, error) {
	var lastErr error
	for _, name := range candidates {
		u, err := resolveURL(baseURL, name)
		if err != nil {
			lastErr = err
			continue
		}
		hash, err := fetchSHA256FromURL(ctx, u)
		if err == nil {
			return hash, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no sha256 candidates provided")
	}
	return "", lastErr
}

func fetchSHA256FromURL(ctx context.Context, shaURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", shaURL, nil)
	if err != nil {
		return "", fmt.Errorf("error creating request: %w", err)
	}

	client := http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			TLSHandshakeTimeout: 30 * time.Second,
			TLSClientConfig: &tls.Config{
				RootCAs: rootcerts.ServerCertPool(),
			},
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error fetching sha256 file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code fetching sha256 file: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading sha256 file: %w", err)
	}

	hash, err := parseSHA256Text(string(body))
	if err != nil {
		return "", fmt.Errorf("invalid sha256 file content: %w", err)
	}

	return hash, nil
}

func parseSHA256Text(s string) (string, error) {
	re := regexp.MustCompile(`(?i)\b([a-f0-9]{64})\b`)
	match := re.FindStringSubmatch(s)
	if len(match) < 2 {
		return "", fmt.Errorf("no sha256 hash found")
	}
	hash := strings.ToLower(strings.TrimSpace(match[1]))
	hash = strings.TrimPrefix(hash, "sha256:")
	return hash, nil
}

func normalizeBaseURL(baseURL string) string {
	s := strings.TrimSpace(baseURL)
	if s == "" {
		return s
	}
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		s = "https://" + s
	}
	if !strings.HasSuffix(s, "/") {
		s += "/"
	}
	return s
}

func resolveURL(baseURL string, path string) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid base URL: %w", err)
	}
	ref, err := url.Parse(path)
	if err != nil {
		return "", fmt.Errorf("invalid URL path: %w", err)
	}
	return u.ResolveReference(ref).String(), nil
}

func parseVersionTxt(s string) (appVersion string, systemVersion string, err error) {
	reApp := regexp.MustCompile(`(?i)\bAppVersion\s*:\s*([0-9A-Za-z.\-+v]+)\b`)
	reSys := regexp.MustCompile(`(?i)\bSystemVersion\s*:\s*([0-9A-Za-z.\-+v]+)\b`)

	appMatch := reApp.FindStringSubmatch(s)
	sysMatch := reSys.FindStringSubmatch(s)

	if len(appMatch) < 2 || len(sysMatch) < 2 {
		return "", "", fmt.Errorf("invalid version.txt format")
	}

	appVersion = strings.TrimSpace(appMatch[1])
	systemVersion = strings.TrimSpace(sysMatch[1])

	return appVersion, systemVersion, nil
}

func shouldProxyUpdateDownloadURL(u *url.URL) bool {
	if u == nil {
		return false
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return false
	}
	if host == "github.com" || host == "api.github.com" || host == "codeload.github.com" || host == "raw.githubusercontent.com" {
		return true
	}
	if strings.HasSuffix(host, ".github.com") || strings.HasSuffix(host, ".githubusercontent.com") || strings.HasSuffix(host, ".githubassets.com") {
		return true
	}
	return false
}

func applyUpdateDownloadProxyPrefix(rawURL string) string {
	if config == nil {
		return rawURL
	}
	proxy := strings.TrimSpace(config.UpdateDownloadProxy)
	if proxy == "" {
		return rawURL
	}
	proxy = strings.TrimRight(proxy, "/") + "/"
	if strings.HasPrefix(rawURL, proxy) {
		return rawURL
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed == nil {
		return rawURL
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return rawURL
	}
	if !shouldProxyUpdateDownloadURL(parsed) {
		return rawURL
	}
	return proxy + rawURL
}

func downloadFile(
	ctx context.Context,
	path string,
	url string,
	downloadProgress *float32,
	downloadSpeedBps *float32,
) error {
	//if _, err := os.Stat(path); err == nil {
	//	if err := os.Remove(path); err != nil {
	//		return fmt.Errorf("error removing existing file: %w", err)
	//	}
	//}
	finalURL := applyUpdateDownloadProxyPrefix(url)
	otaLogger.Info().Str("path", path).Str("url", finalURL).Msg("downloading file")

	unverifiedPath := path + ".unverified"
	if _, err := os.Stat(unverifiedPath); err == nil {
		if err := os.Remove(unverifiedPath); err != nil {
			return fmt.Errorf("error removing existing unverified file: %w", err)
		}
	}

	file, err := os.Create(unverifiedPath)
	if err != nil {
		return fmt.Errorf("error creating file: %w", err)
	}
	defer file.Close()

	req, err := http.NewRequestWithContext(ctx, "GET", finalURL, nil)
	if err != nil {
		return fmt.Errorf("error creating request: %w", err)
	}

	client := http.Client{
		Timeout: 10 * time.Minute,
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			TLSHandshakeTimeout: 30 * time.Second,
			TLSClientConfig: &tls.Config{
				RootCAs: rootcerts.ServerCertPool(),
			},
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error downloading file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	totalSize := resp.ContentLength
	hasKnownSize := totalSize > 0

	var written int64
	var lastProgressBytes int64
	lastProgressAt := time.Now()
	lastReportedProgress := float32(0)
	lastSpeedAt := time.Now()
	var lastSpeedBytes int64

	if downloadProgress != nil {
		*downloadProgress = 0
	}
	if downloadSpeedBps != nil {
		*downloadSpeedBps = 0
	}
	if downloadProgress != nil || downloadSpeedBps != nil {
		triggerOTAStateUpdate()
	}

	buf := make([]byte, 32*1024)
	for {
		nr, er := resp.Body.Read(buf)
		if nr > 0 {
			nw, ew := file.Write(buf[0:nr])
			if nw < nr {
				return fmt.Errorf("short write: %d < %d", nw, nr)
			}
			written += int64(nw)
			if ew != nil {
				return fmt.Errorf("error writing to file: %w", ew)
			}
			now := time.Now()
			speedUpdated := false
			progressUpdated := false

			if downloadSpeedBps != nil {
				dt := now.Sub(lastSpeedAt)
				if dt >= 1*time.Second {
					seconds := float32(dt.Seconds())
					if seconds <= 0 {
						*downloadSpeedBps = 0
					} else {
						*downloadSpeedBps = float32(written-lastSpeedBytes) / seconds
					}
					lastSpeedAt = now
					lastSpeedBytes = written
					speedUpdated = true
				}
			}

			if hasKnownSize && downloadProgress != nil {
				progress := float32(written) / float32(totalSize)
				if progress-lastReportedProgress >= 0.001 || now.Sub(lastProgressAt) >= 1*time.Second {
					lastReportedProgress = progress
					*downloadProgress = lastReportedProgress
					lastProgressAt = now
					progressUpdated = true
				}
			}

			if !hasKnownSize && downloadProgress != nil {
				if *downloadProgress <= 0 {
					*downloadProgress = 0.01
					lastProgressBytes = written
					progressUpdated = true
				} else if written-lastProgressBytes >= 1024*1024 {
					next := *downloadProgress + 0.01
					if next > 0.99 {
						next = 0.99
					}
					if next-*downloadProgress >= 0.01 {
						*downloadProgress = next
						lastProgressBytes = written
						progressUpdated = true
					}
				}
			}

			if speedUpdated || progressUpdated {
				triggerOTAStateUpdate()
			}
		}
		if er != nil {
			if er == io.EOF {
				break
			}
			return fmt.Errorf("error reading response body: %w", er)
		}
	}

	if hasKnownSize && written != totalSize {
		return fmt.Errorf("incomplete download: wrote %d bytes, expected %d bytes", written, totalSize)
	}

	if downloadProgress != nil && !hasKnownSize {
		*downloadProgress = 1
		if downloadSpeedBps != nil {
			*downloadSpeedBps = 0
		}
		triggerOTAStateUpdate()
	}

	if downloadSpeedBps != nil && hasKnownSize {
		*downloadSpeedBps = 0
		triggerOTAStateUpdate()
	}

	file.Close()

	// Flush filesystem buffers to ensure all data is written to disk
	err = exec.Command("sync").Run()
	if err != nil {
		otaLogger.Warn().Err(err).Msg("Failed to flush filesystem buffers")
	}

	// Clear the filesystem caches to force a read from disk
	err = os.WriteFile("/proc/sys/vm/drop_caches", []byte("1"), 0o644)
	if err != nil {
		otaLogger.Warn().Err(err).Msg("Failed to clear filesystem caches")
	}

	// without check
	//if err := os.Rename(unverifiedPath, path); err != nil {
	//	return fmt.Errorf("error renaming file: %w", err)
	//}

	//if err := os.Chmod(path, 0755); err != nil {
	//	return fmt.Errorf("error making file executable: %w", err)
	//}

	return nil
}

func prepareSystemUpdateTarFromKvmSystemZip(
	ctx context.Context,
	zipURL string,
	outputTarPath string,
	downloadProgress *float32,
	downloadSpeedBps *float32,
	verificationProgress *float32,
	sigURL string,
	expectedHash string,
	scopedLogger *zerolog.Logger,
) error {
	if scopedLogger == nil {
		scopedLogger = otaLogger
	}

	baseDir := "/userdata/picokvm"
	workDir := filepath.Join(baseDir, "kvm_system_work")
	extractDir := filepath.Join(workDir, "extract")
	zipPath := filepath.Join(workDir, "master.zip")

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return fmt.Errorf("error creating work dir: %w", err)
	}

	if err := os.RemoveAll(extractDir); err != nil {
		return fmt.Errorf("error cleaning extract dir: %w", err)
	}
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return fmt.Errorf("error creating extract dir: %w", err)
	}

	if verificationProgress != nil {
		*verificationProgress = 0
		triggerOTAStateUpdate()
	}

	maxAttempts := 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if downloadProgress != nil {
			*downloadProgress = 0
		}
		if downloadSpeedBps != nil {
			*downloadSpeedBps = 0
		}
		if downloadProgress != nil || downloadSpeedBps != nil {
			triggerOTAStateUpdate()
		}

		if err := downloadFile(ctx, zipPath, zipURL, downloadProgress, downloadSpeedBps); err != nil {
			lastErr = err
		} else {
			zipUnverifiedPath := zipPath + ".unverified"
			if _, err := os.Stat(zipUnverifiedPath); err != nil {
				lastErr = fmt.Errorf("downloaded zip not found: %s: %w", zipUnverifiedPath, err)
			} else if sigURL != "" || expectedHash != "" {
				if err := verifyFile(ctx, zipPath, expectedHash, sigURL, verificationProgress, scopedLogger); err != nil {
					lastErr = fmt.Errorf("system zip verification failed: %w", err)
				} else if err := unzipArchive(zipUnverifiedPath, extractDir); err != nil {
					lastErr = err
				} else {
					lastErr = nil
					break
				}
			} else if err := unzipArchive(zipUnverifiedPath, extractDir); err != nil {
				lastErr = err
			} else {
				lastErr = nil
				break
			}
		}

		_ = os.Remove(zipPath + ".unverified")
		_ = os.RemoveAll(extractDir)
		_ = os.MkdirAll(extractDir, 0o755)
		if attempt < maxAttempts {
			time.Sleep(time.Duration(attempt*2) * time.Second)
		}
	}
	if lastErr != nil {
		return lastErr
	}

	extractedRoot := filepath.Join(extractDir, "kvm_system-master")
	if _, err := os.Stat(extractedRoot); err != nil {
		entries, readErr := os.ReadDir(extractDir)
		if readErr != nil {
			return fmt.Errorf("error reading extracted dir: %w", readErr)
		}
		found := ""
		for _, entry := range entries {
			if entry.IsDir() {
				found = filepath.Join(extractDir, entry.Name())
				break
			}
		}
		if found == "" {
			return fmt.Errorf("unable to find extracted root dir in %s", extractDir)
		}
		extractedRoot = found
	}

	scriptPath := filepath.Join(extractedRoot, "split_and_check_md5.sh")
	if _, err := os.Stat(scriptPath); err != nil {
		return fmt.Errorf("split_and_check_md5.sh not found: %w", err)
	}
	if err := os.Chmod(scriptPath, 0o755); err != nil {
		return fmt.Errorf("error chmod split_and_check_md5.sh: %w", err)
	}

	var out bytes.Buffer
	cmd := exec.Command(scriptPath, "merge", "update_system.tar")
	cmd.Dir = extractedRoot
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		out.Reset()
		cmd2 := exec.Command("/bin/sh", scriptPath, "merge", "update_system.tar")
		cmd2.Dir = extractedRoot
		cmd2.Stdout = &out
		cmd2.Stderr = &out
		if err2 := cmd2.Run(); err2 != nil {
			return fmt.Errorf("error merging split system tar: %w / %w\nOutput: %s", err, err2, out.String())
		}
	}

	tarSourcePath := filepath.Join(extractedRoot, "update_system.tar")
	if _, err := os.Stat(tarSourcePath); err != nil {
		return fmt.Errorf("merged tar not found: %s: %w\nOutput: %s", tarSourcePath, err, out.String())
	}

	if err := os.RemoveAll(outputTarPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("error removing existing system tar: %w", err)
	}
	if err := os.Rename(tarSourcePath, outputTarPath); err != nil {
		return fmt.Errorf("error moving merged tar into place: %w", err)
	}

	if verificationProgress != nil {
		*verificationProgress = 1
		triggerOTAStateUpdate()
	}

	if err := os.RemoveAll(extractDir); err != nil {
		scopedLogger.Warn().Err(err).Str("path", extractDir).Msg("Failed to cleanup extracted system zip")
	}
	zipUnverifiedPath := zipPath + ".unverified"
	if err := os.Remove(zipUnverifiedPath); err != nil {
		scopedLogger.Warn().Err(err).Str("path", zipUnverifiedPath).Msg("Failed to cleanup system zip")
	}

	return nil
}

func unzipArchive(zipPath string, destDir string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("error opening zip: %w", err)
	}
	defer reader.Close()

	destClean := filepath.Clean(destDir) + string(os.PathSeparator)

	for _, file := range reader.File {
		targetPath := filepath.Join(destDir, file.Name)
		cleanTargetPath := filepath.Clean(targetPath)
		if !strings.HasPrefix(cleanTargetPath, destClean) {
			return fmt.Errorf("invalid zip path: %s", file.Name)
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTargetPath, 0o755); err != nil {
				return fmt.Errorf("error creating dir: %w", err)
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(cleanTargetPath), 0o755); err != nil {
			return fmt.Errorf("error creating dir: %w", err)
		}

		rc, err := file.Open()
		if err != nil {
			return fmt.Errorf("error opening zipped file: %w", err)
		}

		outFile, err := os.OpenFile(cleanTargetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
		if err != nil {
			rc.Close()
			return fmt.Errorf("error creating file: %w", err)
		}

		_, copyErr := io.Copy(outFile, rc)
		closeErr := outFile.Close()
		rcErr := rc.Close()
		if copyErr != nil {
			return fmt.Errorf("error extracting file: %w", copyErr)
		}
		if closeErr != nil {
			return fmt.Errorf("error closing extracted file: %w", closeErr)
		}
		if rcErr != nil {
			return fmt.Errorf("error closing zip entry: %w", rcErr)
		}
	}

	return nil
}

func verifyFile(ctx context.Context, path string, expectedHash string, sigURL string, verifyProgress *float32, scopedLogger *zerolog.Logger) error {
	if scopedLogger == nil {
		scopedLogger = otaLogger
	}

	unverifiedPath := path + ".unverified"

	if strings.TrimSpace(sigURL) == "" && strings.TrimSpace(expectedHash) == "" {
		return fmt.Errorf("refusing to flash unverified firmware: no signature URL and no hash provided")
	}

	if strings.TrimSpace(sigURL) != "" {
		sigBasePath := path + ".sig"
		sigDownloadErr := downloadFile(ctx, sigBasePath, sigURL, nil, nil)
		sigPath := sigBasePath + ".unverified"
		if sigDownloadErr != nil {
			scopedLogger.Warn().Err(sigDownloadErr).Str("sigURL", sigURL).Msg("failed to download signature file, falling back to hash-only verification")
		} else {
			sigPresent, sigErr := verifyFileSignature(unverifiedPath, sigPath, scopedLogger)
			_ = os.Remove(sigPath)
			if sigPresent && sigErr != nil {
				return fmt.Errorf("signature verification failed: %w", sigErr)
			}
			if sigPresent && sigErr == nil {
				scopedLogger.Info().Str("path", path).Msg("firmware signature verified, proceeding to hash check")
			}
		}
	} else {
		scopedLogger.Info().Str("path", path).Msg("no signature URL provided, skipping signature verification")
	}

	if strings.TrimSpace(expectedHash) == "" {
		if err := os.Rename(unverifiedPath, path); err != nil {
			return fmt.Errorf("error renaming file: %w", err)
		}
		if err := os.Chmod(path, 0o755); err != nil {
			return fmt.Errorf("error making file executable: %w", err)
		}
		return nil
	}

	fileToHash, err := os.Open(unverifiedPath)
	if err != nil {
		return fmt.Errorf("error opening file for hashing: %w", err)
	}
	defer fileToHash.Close()

	hash := sha256.New()
	fileInfo, err := fileToHash.Stat()
	if err != nil {
		return fmt.Errorf("error getting file info: %w", err)
	}
	totalSize := fileInfo.Size()

	buf := make([]byte, 32*1024)
	verified := int64(0)

	for {
		nr, er := fileToHash.Read(buf)
		if nr > 0 {
			nw, ew := hash.Write(buf[0:nr])
			if nw < nr {
				return fmt.Errorf("short write: %d < %d", nw, nr)
			}
			verified += int64(nw)
			if ew != nil {
				return fmt.Errorf("error writing to hash: %w", ew)
			}
			progress := float32(verified) / float32(totalSize)
			if progress-*verifyProgress >= 0.01 {
				*verifyProgress = progress
				triggerOTAStateUpdate()
			}
		}
		if er != nil {
			if er == io.EOF {
				break
			}
			return fmt.Errorf("error reading file: %w", er)
		}
	}

	hashSum := hash.Sum(nil)
	scopedLogger.Info().Str("path", path).Str("hash", hex.EncodeToString(hashSum)).Msg("SHA256 hash of")

	if hex.EncodeToString(hashSum) != expectedHash {
		return fmt.Errorf("hash mismatch: %x != %s", hashSum, expectedHash)
	}

	if err := os.Rename(unverifiedPath, path); err != nil {
		return fmt.Errorf("error renaming file: %w", err)
	}

	if err := os.Chmod(path, 0o755); err != nil {
		return fmt.Errorf("error making file executable: %w", err)
	}

	return nil
}

type OTAState struct {
	Updating                   bool       `json:"updating"`
	Error                      string     `json:"error,omitempty"`
	MetadataFetchedAt          *time.Time `json:"metadataFetchedAt,omitempty"`
	AppUpdatePending           bool       `json:"appUpdatePending"`
	SystemUpdatePending        bool       `json:"systemUpdatePending"`
	AppDownloadProgress        float32    `json:"appDownloadProgress,omitempty"` // TODO: implement for progress bar
	AppDownloadSpeedBps        float32    `json:"appDownloadSpeedBps"`
	AppDownloadFinishedAt      *time.Time `json:"appDownloadFinishedAt,omitempty"`
	SystemDownloadProgress     float32    `json:"systemDownloadProgress,omitempty"` // TODO: implement for progress bar
	SystemDownloadSpeedBps     float32    `json:"systemDownloadSpeedBps"`
	SystemDownloadFinishedAt   *time.Time `json:"systemDownloadFinishedAt,omitempty"`
	AppVerificationProgress    float32    `json:"appVerificationProgress,omitempty"`
	AppVerifiedAt              *time.Time `json:"appVerifiedAt,omitempty"`
	SystemVerificationProgress float32    `json:"systemVerificationProgress,omitempty"`
	SystemVerifiedAt           *time.Time `json:"systemVerifiedAt,omitempty"`
	AppSignatureVerified       bool       `json:"appSignatureVerified,omitempty"`
	SystemSignatureVerified    bool       `json:"systemSignatureVerified,omitempty"`
	AppSignatureMissing        bool       `json:"appSignatureMissing,omitempty"`
	SystemSignatureMissing     bool       `json:"systemSignatureMissing,omitempty"`
	AppUpdateProgress          float32    `json:"appUpdateProgress,omitempty"` // TODO: implement for progress bar
	AppUpdatedAt               *time.Time `json:"appUpdatedAt,omitempty"`
	SystemUpdateProgress       float32    `json:"systemUpdateProgress,omitempty"` // TODO: port rk_ota, then implement
	SystemUpdatedAt            *time.Time `json:"systemUpdatedAt,omitempty"`
}

var otaState = OTAState{}

func triggerOTAStateUpdate() {
	go func() {
		if currentSession == nil {
			logger.Info().Msg("No active RPC session, skipping update state update")
			return
		}
		writeJSONRPCEvent("otaState", otaState, currentSession)
	}()
}

func cleanupUpdateTempFiles(logger *zerolog.Logger) {
	paths := []string{
		"/userdata/picokvm/bin/kvm_app.unverified",
		"/userdata/picokvm/bin/kvm_app.sig.unverified",
		"/userdata/picokvm/update_system.zip.unverified",
		"/userdata/picokvm/update_system.zip.sig.unverified",
		"/userdata/picokvm/update_system.zip",
		"/userdata/picokvm/update_system.tar.unverified",
		"/userdata/picokvm/update_system.tar.sig.unverified",
		"/userdata/picokvm/update_system.tar",
		"/userdata/picokvm/kvm_system_work",
	}

	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil && !os.IsNotExist(err) {
			if logger != nil {
				logger.Warn().Err(err).Str("path", p).Msg("failed to cleanup temp update file")
			} else {
				otaLogger.Warn().Err(err).Str("path", p).Msg("failed to cleanup temp update file")
			}
		}
	}
}

func cleanupLocalPackage() {
	if err := os.RemoveAll(localPackageDir); err != nil && !os.IsNotExist(err) {
		otaLogger.Warn().Err(err).Str("path", localPackageDir).Msg("failed to cleanup local package")
	}
}

func cleanupStaleLocalPackageOnStartup() {
	if _, err := os.Stat(localPackageDir); os.IsNotExist(err) {
		return
	} else if err != nil {
		otaLogger.Warn().Err(err).Str("path", localPackageDir).Msg("failed to stat local package directory on startup")
		return
	}

	otaLogger.Info().Str("path", localPackageDir).Msg("cleaning up stale local package on startup")
	cleanupLocalPackage()
}

func TryUpdate(ctx context.Context, deviceId string) error {
	if !otaUploadMutex.TryLock() {
		return fmt.Errorf("upload in progress, cannot start update")
	}
	otaUploadMutex.Unlock()

	scopedLogger := otaLogger.With().
		Str("deviceId", deviceId).
		Logger()

	scopedLogger.Info().Msg("Trying to update...")
	if otaState.Updating {
		return fmt.Errorf("update already in progress")
	}

	cleanupUpdateTempFiles(&scopedLogger)

	otaState = OTAState{
		Updating: true,
	}
	triggerOTAStateUpdate()

	defer func() {
		otaState.Updating = false
		triggerOTAStateUpdate()
	}()

	// Check for local update
	if updateSource == updateSourceLocal {
		return tryLocalUpdate(ctx, &scopedLogger)
	}

	updateStatus, err := GetUpdateStatus(ctx, deviceId)
	if err != nil {
		otaState.Error = fmt.Sprintf("Error checking for updates: %v", err)
		scopedLogger.Error().Err(err).Msg("Error checking for updates")
		return fmt.Errorf("error checking for updates: %w", err)
	}

	now := time.Now()
	otaState.MetadataFetchedAt = &now
	otaState.AppUpdatePending = updateStatus.AppUpdateAvailable
	otaState.SystemUpdatePending = updateStatus.SystemUpdateAvailable
	triggerOTAStateUpdate()

	local := updateStatus.Local
	remote := updateStatus.Remote
	appUpdateAvailable := updateStatus.AppUpdateAvailable
	systemUpdateAvailable := updateStatus.SystemUpdateAvailable

	rebootNeeded := false

	if appUpdateAvailable {
		scopedLogger.Info().
			Str("local", local.AppVersion).
			Str("remote", remote.AppVersion).
			Msg("App update available")

		err := downloadFile(
			ctx,
			"/userdata/picokvm/bin/kvm_app",
			remote.AppUrl,
			&otaState.AppDownloadProgress,
			&otaState.AppDownloadSpeedBps,
		)
		if err != nil {
			otaState.Error = fmt.Sprintf("Error downloading app update: %v", err)
			scopedLogger.Error().Err(err).Msg("Error downloading app update")
			triggerOTAStateUpdate()
			return err
		}
		downloadFinished := time.Now()
		otaState.AppDownloadFinishedAt = &downloadFinished
		otaState.AppDownloadProgress = 1
		triggerOTAStateUpdate()

		err = verifyFile(
			ctx,
			"/userdata/picokvm/bin/kvm_app",
			remote.AppHash,
			remote.AppSigUrl,
			&otaState.AppVerificationProgress,
			&scopedLogger,
		)
		if err != nil {
			otaState.Error = fmt.Sprintf("Error verifying app update hash: %v", err)
			scopedLogger.Error().Err(err).Msg("Error verifying app update hash")
			triggerOTAStateUpdate()
			return err
		}
		verifyFinished := time.Now()
		otaState.AppVerifiedAt = &verifyFinished
		otaState.AppVerificationProgress = 1
		otaState.AppSignatureVerified = strings.TrimSpace(remote.AppSigUrl) != ""
		otaState.AppUpdatedAt = &verifyFinished
		otaState.AppUpdateProgress = 1
		triggerOTAStateUpdate()

		scopedLogger.Info().Msg("App update downloaded")
		rebootNeeded = true
	} else {
		scopedLogger.Info().Msg("App is up to date")
	}

	if systemUpdateAvailable {
		scopedLogger.Info().
			Str("local", local.SystemVersion).
			Str("remote", remote.SystemVersion).
			Msg("System update available")

		systemTarPath := "/userdata/picokvm/update_system.tar"
		if updateSource == updateSourceGithub || updateSource == updateSourceGitee {
			err := prepareSystemUpdateTarFromKvmSystemZip(
				ctx,
				remote.SystemUrl,
				systemTarPath,
				&otaState.SystemDownloadProgress,
				&otaState.SystemDownloadSpeedBps,
				&otaState.SystemVerificationProgress,
				remote.SystemSigUrl,
				remote.SystemHash,
				&scopedLogger,
			)
			if err != nil {
				otaState.Error = fmt.Sprintf("Error preparing system update: %v", err)
				scopedLogger.Error().Err(err).Msg("Error preparing system update")
				triggerOTAStateUpdate()
				return err
			}
		} else {
			systemZipPath := "/userdata/picokvm/update_system.zip"
			err := downloadFile(
				ctx,
				systemZipPath,
				remote.SystemUrl,
				&otaState.SystemDownloadProgress,
				&otaState.SystemDownloadSpeedBps,
			)
			if err != nil {
				otaState.Error = fmt.Sprintf("Error downloading system update: %v", err)
				scopedLogger.Error().Err(err).Msg("Error downloading system update")
				triggerOTAStateUpdate()
				return err
			}

			err = verifyFile(ctx, systemZipPath, remote.SystemHash, remote.SystemSigUrl, &otaState.SystemVerificationProgress, &scopedLogger)
			if err != nil {
				otaState.Error = fmt.Sprintf("Error preparing system update archive: %v", err)
				scopedLogger.Error().Err(err).Msg("Error preparing system update archive")
				triggerOTAStateUpdate()
				return err
			}

			if err := extractUpdateSystemTarFromZip(systemZipPath, systemTarPath); err != nil {
				otaState.Error = fmt.Sprintf("Error extracting system update tar: %v", err)
				scopedLogger.Error().Err(err).Msg("Error extracting system update tar")
				triggerOTAStateUpdate()
				return err
			}
		}
		downloadFinished := time.Now()
		otaState.SystemDownloadFinishedAt = &downloadFinished
		otaState.SystemDownloadProgress = 1
		triggerOTAStateUpdate()

		scopedLogger.Info().Msg("System update downloaded")
		verifyFinished := time.Now()
		otaState.SystemVerifiedAt = &verifyFinished
		otaState.SystemVerificationProgress = 1
		otaState.SystemSignatureVerified = strings.TrimSpace(remote.SystemSigUrl) != ""
		triggerOTAStateUpdate()

		scopedLogger.Info().Msg("Starting rk_ota command")
		if _, statErr := os.Stat(systemTarPath); statErr != nil {
			otaState.Error = fmt.Sprintf("System update archive not found: %s (%v)", systemTarPath, statErr)
			scopedLogger.Error().Err(statErr).Str("path", systemTarPath).Msg("System update archive missing")
			triggerOTAStateUpdate()
			return fmt.Errorf("system update archive not found: %s: %w", systemTarPath, statErr)
		}

		cmd := exec.Command("rk_ota", "--misc=update", "--tar_path="+systemTarPath, "--save_dir=/userdata/picokvm/ota_save", "--partition=all")
		var b bytes.Buffer
		cmd.Stdout = &b
		cmd.Stderr = &b
		err = cmd.Start()
		if err != nil {
			otaState.Error = fmt.Sprintf("Error starting rk_ota command: %v", err)
			scopedLogger.Error().Err(err).Msg("Error starting rk_ota command")
			triggerOTAStateUpdate()
			return fmt.Errorf("error starting rk_ota command: %w", err)
		}
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		go func() {
			ticker := time.NewTicker(1800 * time.Millisecond)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					if otaState.SystemUpdateProgress >= 0.99 {
						return
					}
					otaState.SystemUpdateProgress += 0.01
					if otaState.SystemUpdateProgress > 0.99 {
						otaState.SystemUpdateProgress = 0.99
					}
					triggerOTAStateUpdate()
				case <-ctx.Done():
					return
				}
			}
		}()

		err = cmd.Wait()
		cancel()
		output := b.String()
		if err != nil {
			otaState.Error = fmt.Sprintf("Error executing rk_ota command: %v\nOutput: %s", err, output)
			scopedLogger.Error().
				Err(err).
				Str("output", output).
				Int("exitCode", cmd.ProcessState.ExitCode()).
				Msg("Error executing rk_ota command")
			triggerOTAStateUpdate()
			return fmt.Errorf("error executing rk_ota command: %w\nOutput: %s", err, output)
		}
		scopedLogger.Info().Str("output", output).Msg("rk_ota success")
		updatedAt := time.Now()
		otaState.SystemUpdateProgress = 1
		otaState.SystemUpdatedAt = &updatedAt
		triggerOTAStateUpdate()
		rebootNeeded = true
	} else {
		scopedLogger.Info().Msg("System is up to date")
	}

	if rebootNeeded {
		cleanupUpdateTempFiles(&scopedLogger)
		scopedLogger.Info().Msg("System Rebooting in 10s")
		time.Sleep(10 * time.Second)
		cmd := exec.Command("reboot")
		err := cmd.Start()
		if err != nil {
			otaState.Error = fmt.Sprintf("Failed to start reboot: %v", err)
			scopedLogger.Error().Err(err).Msg("Failed to start reboot")
			return fmt.Errorf("failed to start reboot: %w", err)
		} else {
			os.Exit(0)
		}
	}

	return nil
}

func GetUpdateStatus(ctx context.Context, deviceId string) (*UpdateStatus, error) {
	updateStatus := &UpdateStatus{}

	// Get local versions
	systemVersionLocal, appVersionLocal, err := GetLocalVersion()
	if err != nil {
		return updateStatus, fmt.Errorf("error getting local version: %w", err)
	}
	updateStatus.Local = &LocalMetadata{
		AppVersion:    appVersionLocal.String(),
		SystemVersion: systemVersionLocal.String(),
	}

	// Get remote metadata
	remoteMetadata, err := fetchUpdateMetadata(ctx, deviceId)
	if err != nil {
		return updateStatus, fmt.Errorf("error checking for updates: %w", err)
	}
	updateStatus.Remote = remoteMetadata

	// Get remote versions
	systemVersionRemote, err := semver.NewVersion(remoteMetadata.SystemVersion)
	if err != nil {
		return updateStatus, fmt.Errorf("error parsing remote system version: %w", err)
	}
	appVersionRemote, err := semver.NewVersion(remoteMetadata.AppVersion)
	if err != nil {
		return updateStatus, fmt.Errorf("error parsing remote app version: %w, %s", err, remoteMetadata.AppVersion)
	}

	updateStatus.SystemUpdateAvailable = systemVersionRemote.GreaterThan(systemVersionLocal)
	updateStatus.AppUpdateAvailable = appVersionRemote.GreaterThan(appVersionLocal)

	updateStatus.AppSignatureMissing = strings.TrimSpace(remoteMetadata.AppSigUrl) == ""
	updateStatus.SystemSignatureMissing = strings.TrimSpace(remoteMetadata.SystemSigUrl) == ""

	return updateStatus, nil
}

func IsUpdatePending() bool {
	return otaState.Updating
}

// make sure our current a/b partition is set as default
func confirmCurrentSystem() {
	output, err := exec.Command("rk_ota", "--misc=now").CombinedOutput()
	if err != nil {
		logger.Warn().Str("output", string(output)).Msg("failed to set current partition in A/B setup")
	}
}

func getOTAPublicKey() ed25519.PublicKey {
	keyStr := strings.TrimSpace(builtOtaPublicKey)
	if keyStr == "" {
		return nil
	}
	keyBytes, err := hex.DecodeString(keyStr)
	if err != nil {
		otaLogger.Warn().Err(err).Msg("invalid OTA public key hex in binary")
		return nil
	}
	if len(keyBytes) != ed25519.PublicKeySize {
		otaLogger.Warn().Int("size", len(keyBytes)).Msg("OTA public key wrong size, expected 32 bytes")
		return nil
	}
	return ed25519.PublicKey(keyBytes)
}

func hashFileSHA256(filePath string) ([32]byte, error) {
	var fileHash [32]byte

	file, err := os.Open(filePath)
	if err != nil {
		return fileHash, fmt.Errorf("error opening file for hashing: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()
	buf := make([]byte, 32*1024)
	if _, err := io.CopyBuffer(hasher, file, buf); err != nil {
		return fileHash, fmt.Errorf("error hashing file: %w", err)
	}

	sum := hasher.Sum(nil)
	copy(fileHash[:], sum)
	return fileHash, nil
}

func verifyFileSignature(
	unverifiedPath string,
	sigPath string,
	scopedLogger *zerolog.Logger,
) (signaturePresent bool, err error) {
	if scopedLogger == nil {
		scopedLogger = otaLogger
	}

	if _, err := os.Stat(sigPath); os.IsNotExist(err) {
		scopedLogger.Info().Str("path", sigPath).Msg("signature file not found, skipping signature verification")
		return false, nil
	}

	sigBytes, err := os.ReadFile(sigPath)
	if err != nil {
		return true, fmt.Errorf("error reading signature file: %w", err)
	}

	if len(sigBytes) != ed25519.SignatureSize {
		return true, fmt.Errorf("invalid signature file size: got %d bytes, expected %d", len(sigBytes), ed25519.SignatureSize)
	}

	publicKey := getOTAPublicKey()
	if publicKey == nil {
		return true, fmt.Errorf("signature present but no public key embedded in binary")
	}

	fileHash, err := hashFileSHA256(unverifiedPath)
	if err != nil {
		return true, err
	}
	if !ed25519.Verify(publicKey, fileHash[:], sigBytes) {
		return true, fmt.Errorf("Ed25519 signature verification failed for %s", unverifiedPath)
	}

	scopedLogger.Info().Str("path", unverifiedPath).Msg("Ed25519 signature verification passed")
	return true, nil
}

func isSigFileAbsent(sigPath string) bool {
	_, err := os.Stat(sigPath)
	return os.IsNotExist(err)
}

func verifyLocalFileSignature(filePath string, sigPath string, publicKey ed25519.PublicKey) bool {
	sigBytes, err := os.ReadFile(sigPath)
	if err != nil {
		return false
	}
	if len(sigBytes) != ed25519.SignatureSize {
		return false
	}

	fileHash, err := hashFileSHA256(filePath)
	if err != nil {
		return false
	}

	return ed25519.Verify(publicKey, fileHash[:], sigBytes)
}

type SignatureUpdateResult struct {
	AppSignatureUpdated    bool   `json:"appSignatureUpdated"`
	SystemSignatureUpdated bool   `json:"systemSignatureUpdated"`
	AppSignatureValid      bool   `json:"appSignatureValid"`
	SystemSignatureValid   bool   `json:"systemSignatureValid"`
	Error                  string `json:"error,omitempty"`
}

func UpdateSignatures(ctx context.Context) (*SignatureUpdateResult, error) {
	result := &SignatureUpdateResult{}

	remoteMetadata, err := fetchUpdateMetadata(ctx, "")
	if err != nil {
		result.Error = fmt.Sprintf("failed to fetch remote metadata: %v", err)
		return result, fmt.Errorf("failed to fetch remote metadata: %w", err)
	}

	publicKey := getOTAPublicKey()

	appBinPath := "/userdata/picokvm/bin/kvm_app"
	appSigPath := appBinPath + ".sig"

	if strings.TrimSpace(remoteMetadata.AppSigUrl) != "" {
		err := downloadFile(ctx, appSigPath, remoteMetadata.AppSigUrl, nil, nil)
		if err != nil {
			result.Error = fmt.Sprintf("failed to download app signature: %v", err)
			return result, fmt.Errorf("failed to download app signature: %w", err)
		}
		result.AppSignatureUpdated = true

		sigUnverified := appSigPath + ".unverified"
		if _, statErr := os.Stat(sigUnverified); statErr == nil {
			_ = os.Remove(appSigPath)
			if renameErr := os.Rename(sigUnverified, appSigPath); renameErr != nil {
				result.Error = fmt.Sprintf("failed to rename app signature: %v", renameErr)
				return result, fmt.Errorf("failed to rename app signature: %w", renameErr)
			}
		}

		if publicKey != nil {
			result.AppSignatureValid = verifyLocalFileSignature(appBinPath, appSigPath, publicKey)
		}
	}

	return result, nil
}

// Stream multipart uploads directly to persistent storage to avoid /tmp temp files on low-memory devices.
func streamMultipartUploadToFile(r *http.Request, fieldName string, targetPath string, validateFilename func(string) error) (string, int64, int, error) {
	reader, err := r.MultipartReader()
	if err != nil {
		return "", 0, http.StatusBadRequest, fmt.Errorf("invalid multipart upload: %w", err)
	}

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", 0, http.StatusBadRequest, fmt.Errorf("failed to read upload stream: %w", err)
		}

		if part.FormName() != fieldName || part.FileName() == "" {
			_, _ = io.Copy(io.Discard, part)
			_ = part.Close()
			continue
		}

		filename := part.FileName()
		if validateFilename != nil {
			if err := validateFilename(filename); err != nil {
				_ = part.Close()
				return filename, 0, http.StatusBadRequest, err
			}
		}

		out, err := os.Create(targetPath)
		if err != nil {
			_ = part.Close()
			return filename, 0, http.StatusInternalServerError, fmt.Errorf("failed to create target file: %w", err)
		}

		written, copyErr := io.Copy(out, part)
		closeErr := out.Close()
		_ = part.Close()
		if copyErr != nil {
			_ = os.Remove(targetPath)
			return filename, written, http.StatusInternalServerError, fmt.Errorf("failed to save file: %w", copyErr)
		}
		if closeErr != nil {
			_ = os.Remove(targetPath)
			return filename, written, http.StatusInternalServerError, fmt.Errorf("failed to finalize file: %w", closeErr)
		}

		return filename, written, http.StatusOK, nil
	}

	return "", 0, http.StatusBadRequest, fmt.Errorf("no file uploaded")
}

func handleOTAUploadHttp(c *gin.Context) {
	otaUploadMutex.Lock()
	defer otaUploadMutex.Unlock()

	updateType := c.Query("type")
	if updateType != "app" && updateType != "system" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid type parameter, must be 'app' or 'system'"})
		return
	}

	// Check if update is in progress
	if otaState.Updating {
		c.JSON(http.StatusConflict, gin.H{"error": "Update already in progress"})
		return
	}

	// Create upload directory if it doesn't exist
	uploadDir := "/userdata/picokvm/ota_uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Determine target filename
	var targetFilename string
	if updateType == "app" {
		targetFilename = "kvm_app.zip"
	} else {
		targetFilename = "update_system.tar"
	}
	targetPath := filepath.Join(uploadDir, targetFilename)

	// Stream the uploaded file directly to persistent storage.
	_, written, statusCode, err := streamMultipartUploadToFile(c.Request, "file", targetPath, func(filename string) error {
		lowerName := strings.ToLower(filename)
		if updateType == "app" && !strings.HasSuffix(lowerName, ".zip") {
			return fmt.Errorf("app firmware must be a .zip file")
		}
		if updateType == "system" && !strings.HasSuffix(lowerName, ".tar") {
			return fmt.Errorf("system firmware must be a .tar file")
		}
		return nil
	})
	if err != nil {
		_ = os.Remove(targetPath)
		c.JSON(statusCode, gin.H{"error": err.Error()})
		return
	}

	// Verify file content
	if updateType == "app" {
		// Verify zip contains kvm_app binary
		if err := verifyAppZipContent(targetPath); err != nil {
			os.Remove(targetPath)
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid app firmware: %v", err)})
			return
		}
	} else {
		// Verify tar is valid
		if err := verifySystemTarContent(targetPath); err != nil {
			os.Remove(targetPath)
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid system firmware: %v", err)})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Upload completed",
		"filePath": targetPath,
		"size":     written,
	})
}

func handleLocalPackageUploadHttp(c *gin.Context) {
	otaUploadMutex.Lock()
	defer otaUploadMutex.Unlock()

	// Check if update is in progress
	if otaState.Updating {
		c.JSON(http.StatusConflict, gin.H{"error": "Update already in progress"})
		return
	}

	// Clean up any existing package
	cleanupLocalPackage()

	// Create temp directory
	if err := os.MkdirAll(localPackageDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create temp directory"})
		return
	}

	// Save ZIP file
	zipPath := filepath.Join(localPackageDir, "pkg.zip")
	_, _, statusCode, err := streamMultipartUploadToFile(c.Request, "file", zipPath, func(filename string) error {
		if !strings.HasSuffix(strings.ToLower(filename), ".zip") {
			return fmt.Errorf("file must be a .zip archive")
		}
		return nil
	})
	if err != nil {
		cleanupLocalPackage()
		c.JSON(statusCode, gin.H{"error": err.Error()})
		return
	}

	// Extract ZIP
	if err := unzipArchive(zipPath, localPackageDir); err != nil {
		cleanupLocalPackage()
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to extract ZIP: %v", err)})
		return
	}

	// Remove the uploaded archive after extraction to reduce peak storage usage.
	if err := os.Remove(zipPath); err != nil && !os.IsNotExist(err) {
		otaLogger.Warn().Err(err).Str("path", zipPath).Msg("failed to remove uploaded local package archive")
	}

	// Validate version.txt exists
	versionPath := filepath.Join(localPackageDir, "version.txt")
	if _, err := os.Stat(versionPath); os.IsNotExist(err) {
		cleanupLocalPackage()
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid package: version.txt not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func verifyAppZipContent(zipPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name == "kvm_app" || f.Name == "kvm_app.exe" {
			return nil
		}
	}

	return fmt.Errorf("kvm_app binary not found in zip")
}

func verifySystemTarContent(tarPath string) error {
	f, err := os.Open(tarPath)
	if err != nil {
		return fmt.Errorf("failed to open tar: %w", err)
	}
	defer f.Close()

	// Try to read tar header
	tr := tar.NewReader(f)
	_, err = tr.Next()
	if err != nil {
		return fmt.Errorf("invalid tar file: %w", err)
	}

	return nil
}

func tryLocalUpdate(ctx context.Context, scopedLogger *zerolog.Logger) error {
	pkgDir := localPackageDir

	// Get package info
	info, err := GetLocalPackageInfo()
	if err != nil {
		return fmt.Errorf("failed to get package info: %w", err)
	}

	scopedLogger.Info().
		Str("appVersion", info.AppVersion).
		Str("systemVersion", info.SystemVersion).
		Bool("hasApp", info.HasApp).
		Bool("hasSystem", info.HasSystem).
		Msg("Local package info")

	// Process App update
	if info.HasApp {
		appPath := filepath.Join(pkgDir, "kvm_app")
		scopedLogger.Info().Str("path", appPath).Msg("Processing local app update")

		otaState.AppUpdatePending = true
		triggerOTAStateUpdate()

		appBinPath := "/userdata/picokvm/bin/kvm_app"
		appBinUnverifiedPath := appBinPath + ".unverified"

		// Stage the new binary at a temporary path before atomically replacing the running app.
		if err := copyFile(appPath, appBinUnverifiedPath); err != nil {
			otaState.Error = fmt.Sprintf("Failed to copy app: %v", err)
			triggerOTAStateUpdate()
			return err
		}

		if err := os.Chmod(appBinUnverifiedPath, 0o755); err != nil {
			otaState.Error = fmt.Sprintf("Failed to chmod app: %v", err)
			triggerOTAStateUpdate()
			return err
		}

		otaState.AppDownloadProgress = 1
		triggerOTAStateUpdate()

		// Verify hash if sha256 file exists
		hashPath := filepath.Join(pkgDir, "kvm_app.sha256")
		if _, err := os.Stat(hashPath); err == nil {
			if err := verifyLocalPackageHash(appBinUnverifiedPath, hashPath, scopedLogger); err != nil {
				otaState.Error = fmt.Sprintf("Failed to verify app hash: %v", err)
				triggerOTAStateUpdate()
				return err
			}
		}

		otaState.AppVerificationProgress = 1
		now := time.Now()
		otaState.AppVerifiedAt = &now
		triggerOTAStateUpdate()

		if err := os.Rename(appBinUnverifiedPath, appBinPath); err != nil {
			otaState.Error = fmt.Sprintf("Failed to finalize app update: %v", err)
			triggerOTAStateUpdate()
			return err
		}

		otaState.AppUpdatedAt = &now
		otaState.AppUpdateProgress = 1
		triggerOTAStateUpdate()
	}

	// Process System update
	if info.HasSystem {
		systemPath := filepath.Join(pkgDir, "update_system.zip")
		scopedLogger.Info().Str("path", systemPath).Msg("Processing local system update")

		otaState.SystemUpdatePending = true
		triggerOTAStateUpdate()

		systemTarPath := "/userdata/picokvm/update_system.tar"
		systemTarUnverifiedPath := systemTarPath + ".unverified"

		// Extract the tarball to a temporary path first, matching the remote update flow.
		if err := extractUpdateSystemTarFromZip(systemPath, systemTarUnverifiedPath); err != nil {
			otaState.Error = fmt.Sprintf("Failed to extract system update: %v", err)
			triggerOTAStateUpdate()
			return err
		}

		otaState.SystemDownloadProgress = 1
		triggerOTAStateUpdate()

		// Verify hash if sha256 file exists
		hashPath := filepath.Join(pkgDir, "update_system.zip.sha256")
		if _, err := os.Stat(hashPath); err == nil {
			if err := verifyLocalPackageHash(systemPath, hashPath, scopedLogger); err != nil {
				otaState.Error = fmt.Sprintf("Failed to verify system hash: %v", err)
				triggerOTAStateUpdate()
				return err
			}
		}

		otaState.SystemVerificationProgress = 1
		now := time.Now()
		otaState.SystemVerifiedAt = &now
		triggerOTAStateUpdate()

		if err := os.Rename(systemTarUnverifiedPath, systemTarPath); err != nil {
			otaState.Error = fmt.Sprintf("Failed to finalize system update: %v", err)
			triggerOTAStateUpdate()
			return err
		}

		// Run rk_ota
		scopedLogger.Info().Msg("Starting rk_ota command")
		cmd := exec.Command("rk_ota", "--misc=update", "--tar_path="+systemTarPath, "--save_dir=/userdata/picokvm/ota_save", "--partition=all")
		var b bytes.Buffer
		cmd.Stdout = &b
		cmd.Stderr = &b
		err = cmd.Run()
		if err != nil {
			output := b.String()
			otaState.Error = fmt.Sprintf("Error executing rk_ota: %v\nOutput: %s", err, output)
			triggerOTAStateUpdate()
			return fmt.Errorf("error executing rk_ota: %w\nOutput: %s", err, output)
		}

		now = time.Now()
		otaState.SystemUpdatedAt = &now
		otaState.SystemUpdateProgress = 1
		triggerOTAStateUpdate()
	}

	// Clean up local package
	cleanupLocalPackage()

	// Reboot
	scopedLogger.Info().Msg("Local update completed, rebooting in 10s")
	time.Sleep(10 * time.Second)
	rebootCmd := exec.Command("reboot")
	if err := rebootCmd.Start(); err != nil {
		return fmt.Errorf("failed to start reboot: %w", err)
	}
	os.Exit(0)
	return nil
}

func extractAppFromZip(zipPath string, targetPath string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open zip: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name == "kvm_app" || f.Name == "kvm_app.exe" {
			rc, err := f.Open()
			if err != nil {
				return fmt.Errorf("failed to open kvm_app in zip: %w", err)
			}
			defer rc.Close()

			// Create temp file first
			tmpPath := targetPath + ".tmp"
			out, err := os.Create(tmpPath)
			if err != nil {
				return fmt.Errorf("failed to create temp file: %w", err)
			}

			if _, err := io.Copy(out, rc); err != nil {
				out.Close()
				os.Remove(tmpPath)
				return fmt.Errorf("failed to extract kvm_app: %w", err)
			}
			out.Close()

			// Make executable
			if err := os.Chmod(tmpPath, 0o755); err != nil {
				os.Remove(tmpPath)
				return fmt.Errorf("failed to chmod: %w", err)
			}

			// Replace existing file
			if err := os.Rename(tmpPath, targetPath); err != nil {
				os.Remove(tmpPath)
				return fmt.Errorf("failed to replace file: %w", err)
			}

			return nil
		}
	}

	return fmt.Errorf("kvm_app not found in zip")
}

func calculateFileSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

func verifyLocalPackageHash(filePath string, hashFilePath string, scopedLogger *zerolog.Logger) error {
	hashFileBytes, err := os.ReadFile(hashFilePath)
	if err != nil {
		return fmt.Errorf("failed to read hash file: %w", err)
	}

	expectedHash, err := parseSHA256Text(string(hashFileBytes))
	if err != nil {
		return fmt.Errorf("failed to parse hash file: %w", err)
	}

	actualHash, err := calculateFileSHA256(filePath)
	if err != nil {
		return fmt.Errorf("failed to calculate file hash: %w", err)
	}

	if scopedLogger != nil {
		scopedLogger.Info().
			Str("path", filePath).
			Str("expectedHash", expectedHash).
			Str("actualHash", actualHash).
			Msg("Verified local package hash")
	}

	if actualHash != expectedHash {
		return fmt.Errorf("hash mismatch: %s != %s", actualHash, expectedHash)
	}

	return nil
}
