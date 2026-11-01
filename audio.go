package kvm

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os/exec"
	"sync"
	"time"

	"github.com/pion/rtp"
)

var (
	audioListener *net.UDPConn
	currentPort   int
	mutex         sync.Mutex
	portList      = []int{3333}
	portIndex     = 0
)

const (
	maxAudioFrameSize = 1500
	frameDurationMs   = 20
	timestampRate     = 48000
	timestampStep     = timestampRate * frameDurationMs / 1000
)

func waitUDPPortReleased(port int, retries int, delay time.Duration) error {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	for i := 0; i < retries; i++ {
		conn, err := net.ListenPacket("udp", addr)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(delay)
	}
	return fmt.Errorf("port %d still in use after %d retries", port, retries)
}

func getNextAvailablePort() int {
	for i := 0; i < len(portList); i++ {
		port := portList[portIndex]
		portIndex = (portIndex + 1) % len(portList)
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		conn, err := net.ListenPacket("udp", addr)
		if err == nil {
			conn.Close()
			return port
		}
	}
	return 0
}

var (
	audioStreamerCmd  *exec.Cmd
	audioStreamerLock = &sync.Mutex{}
)

func StartNtpAudioServer(handleClient func(net.Conn)) {
	mutex.Lock()
	defer mutex.Unlock()

	if audioListener != nil || lastAudioState.Ready {
		StopNtpAudioServer()
	}

	port := getNextAvailablePort()
	if port == 0 {
		audioLogger.Error().Msg("no available ports to start audio server")
		return
	}

	listener, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: port})
	if err != nil {
		audioLogger.Error().Err(err).Msg("failed to start server on port %d")
		return
	}

	audioListener = listener
	currentPort = port

	if config.AudioMode == "usb" {
		_, err := CallAudioCtrlAction("set_audio_mode", map[string]interface{}{"audio_mode": "usb", "rtp_port": port})
		if err != nil {
			audioLogger.Error().Err(err).Msg("failed to set audio mode")
		}
		_, err = CallAudioCtrlAction("set_audio_enable", map[string]interface{}{"audio_enable": true})
		if err != nil {
			audioLogger.Error().Err(err).Msg("failed to set audio enable")
		}
	} else if config.AudioMode == "hdmi" {
		// HDMI mode: use our minimal C streamer (kvm_audio_stream) which is much
		// lighter than ffmpeg. kvm_audio's own HDMI mode uses wrong sample rate for
		// this hardware (16kHz instead of 48kHz).
		factor := config.AudioRateFactor
		go func() {
			if err := StartAudioStreamer(port, factor); err != nil {
				audioLogger.Warn().Err(err).Msg("failed to start audio streamer")
			}
		}()
	}

	go handleClient(listener)
}

func StopNtpAudioServer() {
	if config.AudioMode == "usb" {
		_, err := CallAudioCtrlAction("set_audio_enable", map[string]interface{}{"audio_enable": false})
		if err != nil {
			audioLogger.Error().Err(err).Msg("failed to set audio enable")
		}
	}

	// Stop local streamer if running
	StopAudioStreamer()

	if audioListener != nil {
		audioListener.Close()
		audioListener = nil
	}

	if currentPort != 0 {
		if err := waitUDPPortReleased(currentPort, 10, 200*time.Millisecond); err != nil {
			audioLogger.Error().Err(err).Msg("port not released")
		}
		currentPort = 0
	}

	audioLogger.Info().Msg("audio server stopped")
}

// StartAudioStreamer starts a local ffmpeg process that captures HDMI audio (ALSA hw:0,0)
// applies a rate correction factor (pitch/speed change) and sends Opus RTP to the provided port.
func StartAudioStreamer(port int, rateFactor float64) error {
	audioStreamerLock.Lock()
	defer audioStreamerLock.Unlock()

	// Stop existing streamer if running
	if audioStreamerCmd != nil && audioStreamerCmd.Process != nil {
		audioLogger.Info().Msg("stopping existing audio streamer")
		_ = audioStreamerCmd.Process.Kill()
		audioStreamerCmd = nil
	}

	portStr := fmt.Sprintf("%d", port)
	rateStr := fmt.Sprintf("%.6f", rateFactor)
	args := []string{portStr, rateStr}

	audioLogger.Info().Strs("args", args).Msg("starting audio streamer (kvm_audio_stream)")

	cmd := exec.Command("/userdata/picokvm/bin/kvm_audio_stream", args...)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}
	cmd.Stdout = io.Discard

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	// log stderr output
	go func() {
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			audioLogger.Debug().Str("kvm_audio_stream", s.Text()).Msg("kvm_audio_stream")
		}
		if err := s.Err(); err != nil {
			audioLogger.Warn().Err(err).Msg("error reading ffmpeg stderr")
		}
	}()

	audioStreamerCmd = cmd
	return nil
}

// StopAudioStreamer kills the running ffmpeg streamer if present
func StopAudioStreamer() {
	audioStreamerLock.Lock()
	defer audioStreamerLock.Unlock()

	if audioStreamerCmd == nil || audioStreamerCmd.Process == nil {
		return
	}
	audioLogger.Info().Msg("stopping audio streamer")
	_ = audioStreamerCmd.Process.Kill()
	_ = audioStreamerCmd.Wait()
	audioStreamerCmd = nil
}

func handleAudioClient(conn net.Conn) {
	defer conn.Close()

	audioLogger.Info().Msg("native audio socket client connected")
	inboundPacket := make([]byte, maxAudioFrameSize)
	var timestamp uint32
	var packet rtp.Packet

	for {
		n, err := conn.Read(inboundPacket)
		if err != nil {
			audioLogger.Warn().Err(err).Msg("error during read")
			return
		}

		if currentSession != nil {
			if err := packet.Unmarshal(inboundPacket[:n]); err != nil {
				audioLogger.Warn().Err(err).Msg("error unmarshalling audio socket packet")
				continue
			}

			timestamp += timestampStep
			packet.Timestamp = timestamp
			buf, err := packet.Marshal()
			if err != nil {
				audioLogger.Warn().Err(err).Msg("error marshalling packet")
				continue
			}

			if _, err := currentSession.AudioTrack.Write(buf); err != nil {
				audioLogger.Warn().Err(err).Msg("error writing sample")
			}
		}
	}
}

type AudioInputState struct {
	Ready bool   `json:"ready"`
	Error string `json:"error,omitempty"` //no_signal, no_lock, out_of_range
}

var lastAudioState AudioInputState

func HandleAudioStateMessage(event CtrlResponse) {
	audioState := AudioInputState{}
	err := json.Unmarshal(event.Data, &audioState)
	if err != nil {
		audioLogger.Warn().Err(err).Msg("Error parsing audio state json")
		return
	}
	lastAudioState = audioState
}
