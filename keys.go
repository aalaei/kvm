package kvm

import (
	"context"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

const (
	evKey = 0x01
)

type keyHoldResetDetector struct {
	mu        sync.Mutex
	pressAt   map[uint16]time.Time
	threshold time.Duration
	now       func() time.Time
	afterFunc func(d time.Duration, f func()) func() bool
	stop      map[uint16]func() bool
	triggered bool
	onTrigger func(code uint16, hold time.Duration)
}

func newKeyHoldResetDetector(threshold time.Duration, now func() time.Time, afterFunc func(d time.Duration, f func()) func() bool, onTrigger func(code uint16, hold time.Duration)) *keyHoldResetDetector {
	if now == nil {
		now = time.Now
	}
	if afterFunc == nil {
		afterFunc = func(d time.Duration, f func()) func() bool {
			t := time.AfterFunc(d, f)
			return t.Stop
		}
	}
	return &keyHoldResetDetector{
		pressAt:   map[uint16]time.Time{},
		threshold: threshold,
		now:       now,
		afterFunc: afterFunc,
		stop:      map[uint16]func() bool{},
		onTrigger: onTrigger,
	}
}

func (d *keyHoldResetDetector) close() {
	d.mu.Lock()
	defer d.mu.Unlock()
	for code, stop := range d.stop {
		_ = stop()
		delete(d.stop, code)
		delete(d.pressAt, code)
	}
}

func (d *keyHoldResetDetector) fire(code uint16) {
	d.mu.Lock()
	if d.triggered {
		d.mu.Unlock()
		return
	}
	d.triggered = true
	t0, ok := d.pressAt[code]
	now := d.now()
	d.mu.Unlock()

	hold := d.threshold
	if ok {
		hold = now.Sub(t0)
	}
	if d.onTrigger != nil {
		d.onTrigger(code, hold)
	}
}

func (d *keyHoldResetDetector) onEvent(typ uint16, code uint16, val int32) {
	if typ != evKey {
		return
	}

	switch val {
	case 1, 2:
		d.mu.Lock()
		if d.triggered {
			d.mu.Unlock()
			return
		}
		if _, exists := d.pressAt[code]; exists {
			d.mu.Unlock()
			return
		}
		d.pressAt[code] = d.now()
		d.stop[code] = d.afterFunc(d.threshold, func() { d.fire(code) })
		d.mu.Unlock()
		return
	case 0:
		d.mu.Lock()
		if stop, ok := d.stop[code]; ok {
			_ = stop()
			delete(d.stop, code)
		}
		delete(d.pressAt, code)
		d.mu.Unlock()
		return
	default:
		return
	}
}

func defaultInputEventSize() int {
	if strconv.IntSize == 64 {
		return 24
	}
	return 16
}

func findInputEventDeviceByName(deviceName string) (string, error) {
	entries, err := os.ReadDir("/sys/class/input")
	if err != nil {
		return "", err
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "event") {
			continue
		}
		namePath := filepath.Join("/sys/class/input", e.Name(), "device/name")
		b, err := os.ReadFile(namePath)
		if err != nil {
			continue
		}
		n := strings.TrimSpace(string(b))
		if n == deviceName {
			return filepath.Join("/dev/input", e.Name()), nil
		}
	}
	return "", errors.New("input device not found")
}

func watchAdcKeysLongPressReset(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		dev, err := findInputEventDeviceByName("adc-keys")
		if err != nil {
			keysLogger.Warn().Err(err).Msg("adc-keys device not found")
			time.Sleep(2 * time.Second)
			continue
		}

		f, err := os.OpenFile(dev, os.O_RDONLY, 0)
		if err != nil {
			keysLogger.Warn().Err(err).Str("device", dev).Msg("failed to open adc-keys device")
			time.Sleep(2 * time.Second)
			continue
		}

		keysLogger.Info().Str("device", dev).Msg("watching adc-keys events")
		var resetOnce sync.Once
		detector := newKeyHoldResetDetector(
			5*time.Second,
			nil,
			nil,
			func(code uint16, hold time.Duration) {
				resetOnce.Do(func() {
					keysLogger.Warn().Uint16("code", code).Dur("hold", hold).Msg("adc-keys long press detected, resetting config")
					resetConfigFileAndReboot()
				})
			},
		)
		eventSize := defaultInputEventSize()
		buf := make([]byte, eventSize)

		for {
			select {
			case <-ctx.Done():
				detector.close()
				_ = f.Close()
				return
			default:
			}

			_, err := io.ReadFull(f, buf)
			if err != nil {
				if errors.Is(err, syscall.EINVAL) {
					if eventSize == 24 {
						eventSize = 16
					} else {
						eventSize = 24
					}
					buf = make([]byte, eventSize)
					keysLogger.Info().Str("device", dev).Int("event_size", eventSize).Msg("adc-keys switched input_event size")
					continue
				}
				detector.close()
				_ = f.Close()
				keysLogger.Warn().Err(err).Str("device", dev).Msg("adc-keys read failed, reopening")
				time.Sleep(500 * time.Millisecond)
				break
			}

			typeOff, codeOff, valOff := 16, 18, 20
			if eventSize == 16 {
				typeOff, codeOff, valOff = 8, 10, 12
			}

			typ := binary.LittleEndian.Uint16(buf[typeOff : typeOff+2])
			code := binary.LittleEndian.Uint16(buf[codeOff : codeOff+2])
			val := int32(binary.LittleEndian.Uint32(buf[valOff : valOff+4]))

			detector.onEvent(typ, code, val)
		}
	}
}

func resetConfigFileAndReboot() {
	resetFirewallForFactory()

	if err := os.Remove(configPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		keysLogger.Error().Err(err).Str("path", configPath).Msg("failed to delete config file")
	} else {
		keysLogger.Warn().Str("path", configPath).Msg("config file deleted")
	}

	unix.Sync()
	time.Sleep(200 * time.Millisecond)

	if err := unix.Reboot(unix.LINUX_REBOOT_CMD_RESTART); err != nil {
		keysLogger.Error().Err(err).Msg("syscall reboot failed, trying /sbin/reboot")
		_ = exec.Command("/sbin/reboot", "-f").Run()
		_ = exec.Command("reboot", "-f").Run()
	}
}
