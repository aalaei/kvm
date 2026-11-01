package kvm

import (
	"bytes"
	"encoding/json"
	"io"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
	"github.com/pion/webrtc/v4"
	"go.bug.st/serial"
)

const serialPortPath = "/dev/ttyS0"

var port serial.Port

var defaultMode = &serial.Mode{
	BaudRate: 115200,
	DataBits: 8,
	Parity:   serial.NoParity,
	StopBits: serial.OneStopBit,
}

func initSerialPort() {
	_ = reopenSerialPort()
}

func reopenSerialPort() error {
	if port != nil {
		port.Close()
		port = nil
	}
	var err error
	port, err = serial.Open(serialPortPath, defaultMode)
	if err != nil {
		serialLogger.Error().
			Err(err).
			Str("path", serialPortPath).
			Interface("mode", defaultMode).
			Msg("Error opening serial port")
		return err
	}
	serialLogger.Info().
		Str("path", serialPortPath).
		Interface("mode", defaultMode).
		Msg("Serial port opened successfully")
	return nil
}

func handleSerialChannel(d *webrtc.DataChannel) {
	scopedLogger := serialLogger.With().
		Uint16("data_channel_id", *d.ID()).Logger()

	d.OnOpen(func() {
		if err := reopenSerialPort(); err != nil {
			scopedLogger.Error().Err(err).Msg("Failed to open serial port")
			d.Close()
			return
		}

		go func() {
			buf := make([]byte, 1024)
			for {
				n, err := port.Read(buf)
				if err != nil {
					if err != io.EOF {
						scopedLogger.Warn().Err(err).Msg("Failed to read from serial port")
					}
					break
				}
				if err := d.Send(buf[:n]); err != nil {
					scopedLogger.Warn().Err(err).Msg("Failed to send serial output")
					break
				}
			}
		}()
	})

	d.OnMessage(func(msg webrtc.DataChannelMessage) {
		if port == nil {
			return
		}
		_, err := port.Write(msg.Data)
		if err != nil {
			scopedLogger.Warn().Err(err).Msg("Failed to write to serial")
		}
	})

	d.OnError(func(err error) {
		scopedLogger.Warn().Err(err).Msg("Serial channel error")
	})

	d.OnClose(func() {
		if port != nil {
			port.Close()
			port = nil
		}
		scopedLogger.Info().Msg("Serial channel closed")
	})
}

func handleSerialWS(c *gin.Context) {
	source := c.ClientIP()
	scopedLogger := serialLogger.With().
		Str("transport", "websocket").
		Str("source", source).
		Logger()

	wsCon, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		c.Status(500)
		return
	}
	defer wsCon.Close(websocket.StatusNormalClosure, "")

	if err := reopenSerialPort(); err != nil {
		scopedLogger.Error().Err(err).Msg("Failed to open serial port")
		wsCon.Close(websocket.StatusInternalError, "")
		return
	}

	ctx := c.Request.Context()

	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 1024)
		for {
			if port == nil {
				return
			}
			n, readErr := port.Read(buf)
			if readErr != nil {
				if readErr != io.EOF {
					scopedLogger.Warn().Err(readErr).Msg("Failed to read from serial port")
				}
				return
			}
			if writeErr := wsCon.Write(ctx, websocket.MessageBinary, buf[:n]); writeErr != nil {
				return
			}
		}
	}()

	for {
		msgType, data, readErr := wsCon.Read(ctx)
		if readErr != nil {
			break
		}

		if msgType == websocket.MessageText {
			maybeJson := bytes.TrimSpace(data)
			if len(maybeJson) > 1 && maybeJson[0] == '{' && maybeJson[len(maybeJson)-1] == '}' {
				var size TerminalSize
				if err := json.Unmarshal(maybeJson, &size); err == nil {
					continue
				}
			}
		}

		if port == nil {
			continue
		}
		if _, err := port.Write(data); err != nil {
			break
		}
	}

	if port != nil {
		port.Close()
		port = nil
	}
	<-done
}
