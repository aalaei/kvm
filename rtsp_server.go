package kvm

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"fmt"
	"math/rand"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Simple frame ring buffer and broadcaster for H264 NAL units
type frameRing struct {
	mu    sync.Mutex
	buf   [][]byte
	size  int
	start int
	count int
}

func newFrameRing(size int) *frameRing {
	return &frameRing{buf: make([][]byte, size), size: size}
}

func (r *frameRing) push(frame []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	idx := (r.start + r.count) % r.size
	if r.count == r.size {
		// overwrite oldest
		r.start = (r.start + 1) % r.size
		idx = (r.start + r.count - 1) % r.size
		r.buf[idx] = frame
	} else {
		r.buf[idx] = frame
		r.count++
	}
}

func (r *frameRing) snapshot() [][]byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([][]byte, r.count)
	for i := 0; i < r.count; i++ {
		out[i] = r.buf[(r.start+i)%r.size]
	}
	return out
}

// broadcaster to let RTSP clients subscribe to live frames
var (
	frameBuf = newFrameRing(300) // store recent ~300 frames
	clientsMu sync.Mutex
	clients   = map[int]chan []byte{}
	nextCid   = 1
	// keep sps/pps for SDP
	sps []byte
	pps []byte
)

func subscribeFrames() (int, chan []byte) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	ch := make(chan []byte, 32)
	id := nextCid
	nextCid++
	clients[id] = ch
	return id, ch
}

func unsubscribeFrames(id int) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	ch, ok := clients[id]
	if ok {
		close(ch)
		delete(clients, id)
	}
}

func publishFrame(nal []byte) {
	// store recent
	frameBuf.push(nal)
	// broadcast
	clientsMu.Lock()
	for _, ch := range clients {
		select {
		case ch <- nal:
		default:
			// drop if busy
		}
	}
	clientsMu.Unlock()
}

// Parse raw H264 bytes and extract NAL units (Annex-B start codes)
func ParseAndFeedH264(data []byte) {
	// Basic Annex-B parser: split on 0x000001 or 0x00000001
	start := 0
	for start < len(data) {
		// find start code
		i := bytes.Index(data[start:], []byte{0, 0, 1})
		if i < 0 {
			// no start code in remainder: treat as single nal
			if start < len(data) {
				nal := append([]byte{}, data[start:]...)
				processNal(nal)
			}
			break
		}
		i += start
		// find next start code
		next := bytes.Index(data[i+3:], []byte{0, 0, 1})
		if next < 0 {
			// rest until end
			nal := append([]byte{}, data[i+3:]...)
			processNal(nal)
			break
		}
		next += i + 3
		// nal between i+3 and next
		nal := append([]byte{}, data[i+3:next]...)
		processNal(nal)
		start = next
	}
}

func processNal(nal []byte) {
	if len(nal) < 1 {
		return
	}
	typeByte := nal[0] & 0x1f
	if typeByte == 7 { // SPS
		sps = append([]byte{}, nal...)
	} else if typeByte == 8 { // PPS
		pps = append([]byte{}, nal...)
	}
	// publish to ring and clients
	publishFrame(nal)
}

// RTSP server implementation (minimal): supports DESCRIBE, SETUP (interleaved), PLAY

type rtspSession struct {
	conn           net.Conn
	rtpChannel     byte
	seq            uint16
	timestamp      uint32
	ssrc           uint32
	closed         chan struct{}
	// UDP related
	transport      string
	clientRTPAddr  *net.UDPAddr
	clientRTCPAddr *net.UDPAddr
	udpRTPConn     *net.UDPConn
	udpRTCPConn    *net.UDPConn
}

func StartRTSPServer() {
	ln, err := net.Listen("tcp", ":8554")
	if err != nil {
		logger.Warn().Err(err).Msg("failed to start RTSP server on :8554")
		return
	}
	logger.Info().Msg("RTSP server listening on :8554")
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				logger.Warn().Err(err).Msg("rtsp accept error")
				continue
			}
			go handleRTSPConn(conn)
		}
	}()
}

func handleRTSPConn(conn net.Conn) {
	// helper for writing 401 challenge
	writeUnauthorized := func(writer *bufio.Writer, cseq string) {
		fmt.Fprintf(writer, "RTSP/1.0 401 Unauthorized\r\nCSeq: %s\r\nWWW-Authenticate: Basic realm=\"KVM\"\r\n\r\n", cseq)
		writer.Flush()
	}

	// check authorization header and validate password against device password
	checkAuth := func(headers map[string]string) (bool, string) {
		auth, ok := headers["Authorization"]
		if !ok || auth == "" {
			return false, ""
		}
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || parts[0] != "Basic" {
			return false, ""
		}
		payload, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return false, ""
		}
		cred := string(payload)
		sep := strings.IndexByte(cred, ':')
		if sep < 0 {
			return false, ""
		}
		username := cred[:sep]
		password := cred[sep+1:]
		_ = username
		// If device has no password set, reject
		if config.HashedPassword == "" || config.LocalAuthMode == "" {
			return false, "NO_PASSWORD"
		}
		if err := bcrypt.CompareHashAndPassword([]byte(config.HashedPassword), []byte(password)); err != nil {
			return false, "BAD_PASS"
		}
		return true, username
	}

	// helper used specifically during SETUP to send 401/403 responses when missing or bad creds
	checkRtspAuth := func(headers map[string]string, writer *bufio.Writer, cseq string) bool {
		ok, status := checkAuth(headers)
		if !ok {
			if status == "NO_PASSWORD" {
				fmt.Fprintf(writer, "RTSP/1.0 403 Forbidden\r\nCSeq: %s\r\n\r\n", cseq)
				writer.Flush()
				return false
			}
			writeUnauthorized(writer, cseq)
			return false
		}
		return true
	}

	defer conn.Close()
	reader := bufio.NewReader(conn)
	writer := bufio.NewWriter(conn)
	var session *rtspSession
	for {
		reqLine, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		reqLine = strings.TrimSpace(reqLine)
		if reqLine == "" {
			continue
		}
		parts := strings.Split(reqLine, " ")
		if len(parts) < 3 {
			return
		}
		method := parts[0]
		_ = parts[1]
		// read headers
		headers := map[string]string{}
		for {
			line, _ := reader.ReadString('\n')
			line = strings.TrimSpace(line)
			if line == "" {
				break
			}
			kv := strings.SplitN(line, ":", 2)
			if len(kv) == 2 {
				headers[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
			}
		}
		cseq := headers["CSeq"]
		// handle TEARDOWN
		if method == "TEARDOWN" {
			if session != nil {
				if session.udpRTPConn != nil {
					session.udpRTPConn.Close()
				}
				if session.udpRTCPConn != nil {
					session.udpRTCPConn.Close()
				}
				close(session.closed)
			}
			fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\n\r\n", cseq)
			writer.Flush()
			return
		}
		if method == "OPTIONS" {
			// respond with supported methods, require authchallenge only for later methods
			fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\nPublic: OPTIONS, DESCRIBE, SETUP, TEARDOWN, PLAY\r\n\r\n", cseq)
			writer.Flush()
			continue
		}
		// Enforce authentication for DESCRIBE/SETUP/PLAY
		if method == "DESCRIBE" || method == "SETUP" || method == "PLAY" {
			ok, status := checkAuth(headers)
			if !ok {
				if status == "NO_PASSWORD" {
					fmt.Fprintf(writer, "RTSP/1.0 403 Forbidden\r\nCSeq: %s\r\n\r\n", cseq)
					writer.Flush()
					continue
				}
				writeUnauthorized(writer, cseq)
				continue
			}
		}
		if method == "DESCRIBE" {
			// Build SDP using sps/pps if available
			sdp := "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Picokvm\r\n"
			sdp += "m=video 0 RTP/AVP 96\r\n"
			sdp += "c=IN IP4 0.0.0.0\r\n"
			sdp += "a=rtpmap:96 H264/90000\r\n"
			if len(sps) > 0 && len(pps) > 0 {
				spsb := base64.StdEncoding.EncodeToString(sps)
				ppsb := base64.StdEncoding.EncodeToString(pps)
				sdp += fmt.Sprintf("a=fmtp:96 packetization-mode=1; sprop-parameter-sets=%s,%s;\r\n", spsb, ppsb)
			}
			sdp += "a=control:streamid=0\r\n"
			fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\nContent-Type: application/sdp\r\nContent-Length: %d\r\n\r\n%s", cseq, len(sdp), sdp)
			writer.Flush()
			continue
		}
		if method == "SETUP" {
			if !checkRtspAuth(headers, writer, cseq) {
				continue
			}
			transport, ok := headers["Transport"]
			if !ok {
				fmt.Fprintf(writer, "RTSP/1.0 400 Bad Request\r\nCSeq: %s\r\n\r\n", cseq)
				writer.Flush()
				return
			}

			// If client requested UDP transport (RTP/AVP) and provided client_port, handle UDP
			if strings.Contains(transport, "RTP/AVP") && strings.Contains(transport, "client_port=") {
				// parse client_port
				var clientRtp, clientRtcp int
				parts := strings.Split(transport, ";")
				for _, p := range parts {
					p = strings.TrimSpace(p)
					if strings.HasPrefix(p, "client_port=") {
						vals := strings.TrimPrefix(p, "client_port=")
						pair := strings.Split(vals, "-")
						if len(pair) == 2 {
							clientRtp, _ = strconv.Atoi(pair[0])
							clientRtcp, _ = strconv.Atoi(pair[1])
						}
					}
				}
				if clientRtp == 0 {
					fmt.Fprintf(writer, "RTSP/1.0 461 Unsupported Transport\r\nCSeq: %s\r\n\r\n", cseq)
					writer.Flush()
					return
				}

				// create session with UDP transport
			session = &rtspSession{
				conn:       conn,
				seq:        uint16(rand.Uint32()),
				timestamp:  uint32(rand.Uint32()),
				ssrc:       rand.Uint32(),
				closed:     make(chan struct{}),
				// transport field will be used in streamToClient
			}

				// client address
				clientAddr := conn.RemoteAddr().(*net.TCPAddr)
				session.clientRTPAddr = &net.UDPAddr{IP: clientAddr.IP, Port: clientRtp}
				session.clientRTCPAddr = &net.UDPAddr{IP: clientAddr.IP, Port: clientRtcp}

				// bind local UDP ports (RTP and RTCP)
				rtpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
				if err != nil {
					fmt.Fprintf(writer, "RTSP/1.0 500 Internal Server Error\r\nCSeq: %s\r\n\r\n", cseq)
					writer.Flush()
					return
				}
				rtcpConn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
				if err != nil {
					rtpConn.Close()
					fmt.Fprintf(writer, "RTSP/1.0 500 Internal Server Error\r\nCSeq: %s\r\n\r\n", cseq)
					writer.Flush()
					return
				}
				session.udpRTPConn = rtpConn
				session.udpRTCPConn = rtcpConn
				session.transport = "udp"

				serverRtp := rtpConn.LocalAddr().(*net.UDPAddr).Port
				serverRtcp := rtcpConn.LocalAddr().(*net.UDPAddr).Port

				// respond with server ports
				fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\nTransport: RTP/AVP;unicast;client_port=%d-%d;server_port=%d-%d\r\nSession: 1\r\n\r\n", cseq, clientRtp, clientRtcp, serverRtp, serverRtcp)
				writer.Flush()
				continue
			}

			// fallback: only support interleaved TCP for now
			if !strings.Contains(transport, "RTP/AVP/TCP") && !strings.Contains(transport, "interleaved") {
				fmt.Fprintf(writer, "RTSP/1.0 461 Unsupported Transport\r\nCSeq: %s\r\n\r\n", cseq)
				writer.Flush()
				return
			}

			// parse interleaved channels
			ch0 := byte(0)
			nparts := strings.Split(transport, ";")
			for _, p := range nparts {
				p = strings.TrimSpace(p)
				if strings.HasPrefix(p, "interleaved=") {
					vals := strings.TrimPrefix(p, "interleaved=")
					pair := strings.Split(vals, "-")
					if len(pair) == 2 {
						n0, _ := strconv.Atoi(pair[0])
						ch0 = byte(n0)
					}
				}
			}
			// create session
			session = &rtspSession{
				conn:       conn,
				rtpChannel: ch0,
				seq:        uint16(rand.Uint32()),
				timestamp:  uint32(rand.Uint32()),
				ssrc:       rand.Uint32(),
				closed:     make(chan struct{}),
				transport:  "tcp",
			}
			// response with transport header echoing interleaved
			fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\nTransport: RTP/AVP/TCP;interleaved=%d-%d\r\nSession: 1\r\n\r\n", cseq, ch0, ch0+1)
			writer.Flush()
			continue
		}
		if method == "PLAY" {
			if session == nil {
				fmt.Fprintf(writer, "RTSP/1.0 454 Session Not Found\r\nCSeq: %s\r\n\r\n", cseq)
				writer.Flush()
				return
			}
			fmt.Fprintf(writer, "RTSP/1.0 200 OK\r\nCSeq: %s\r\nRange: npt=0.000-\r\n\r\n", cseq)
			writer.Flush()
			// start streaming (if UDP transport, ensure client ports are reachable)
			if session.transport == "udp" {
				// no-op: UDP sockets already bound in SETUP; streamToClient will send UDP
			}
			go streamToClient(session)
			// block until conn closes
			<-session.closed
			return
		}
		// not supported
		fmt.Fprintf(writer, "RTSP/1.0 501 Not Implemented\r\nCSeq: %s\r\n\r\n", cseq)
		writer.Flush()
	}
}

func streamToClient(s *rtspSession) {
	id, ch := subscribeFrames()
	defer unsubscribeFrames(id)
	conn := s.conn
	mtu := 1200 // payload MTU
	fps := lastVideoState.FramePerSecond
	if fps <= 0 {
		fps = 30
	}
	clockInc := uint32(90000 / int(fps))
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case nal, ok := <-ch:
			if !ok {
				if s.udpRTPConn != nil {
					s.udpRTPConn.Close()
				}
				if s.udpRTCPConn != nil {
					s.udpRTCPConn.Close()
				}
				close(s.closed)
				return
			}
			// packetize nal into RTP payloads
			payloads := packetizeH264(nal, mtu)
			for i, payload := range payloads {
				marker := false
				if i == len(payloads)-1 {
					marker = true
				}
				rtp := buildRtpPacket(s.seq, s.timestamp, s.ssrc, payload, marker)
				s.seq++
				if s.transport == "udp" && s.udpRTPConn != nil && s.clientRTPAddr != nil {
					// send via UDP to client
					if _, err := s.udpRTPConn.WriteToUDP(rtp, s.clientRTPAddr); err != nil {
						close(s.closed)
						return
					}
				} else {
					// default to TCP interleaved
					lenb := len(rtp)
					header := []byte{'$', s.rtpChannel, byte(lenb >> 8), byte(lenb & 0xff)}
					if _, err := conn.Write(header); err != nil {
						close(s.closed)
						return
					}
					if _, err := conn.Write(rtp); err != nil {
						close(s.closed)
						return
					}
				}
			}
			// advance timestamp per frame
			s.timestamp += clockInc
		case <-time.After(5 * time.Second):
			// keep alive, don't block forever
			_ = ticker
		}
	}
}

func packetizeH264(nal []byte, mtu int) [][]byte {
	if len(nal) <= mtu {
		return [][]byte{nal}
	}
	// FU-A fragmentation
	var out [][]byte
	nalHeader := nal[0]
	fuIndicator := (nalHeader & 0xE0) | 28 // FU-A
	nalType := nalHeader & 0x1F
	// payload without nal header
	payload := nal[1:]
	maxChunk := mtu - 2 // FU-A header uses 2 bytes
	for i := 0; i < len(payload); i += maxChunk {
		end := i + maxChunk
		if end > len(payload) {
			end = len(payload)
		}
		chunk := payload[i:end]
		fuHeader := byte(0)
		if i == 0 {
			fuHeader |= 0x80 // S
		}
		if end == len(payload) {
			fuHeader |= 0x40 // E
		}
		fuHeader |= nalType
		p := []byte{fuIndicator, fuHeader}
		p = append(p, chunk...)
		out = append(out, p)
	}
	return out
}

func buildRtpPacket(seq uint16, ts uint32, ssrc uint32, payload []byte, marker bool) []byte {
	head := make([]byte, 12)
	// V=2
	head[0] = 0x80
	if marker {
		head[1] = 0x80 | 96 // M bit + payload type 96
	} else {
		head[1] = 96
	}
	// sequence
	head[2] = byte(seq >> 8)
	head[3] = byte(seq & 0xff)
	// timestamp
	head[4] = byte(ts >> 24)
	head[5] = byte(ts >> 16)
	head[6] = byte(ts >> 8)
	head[7] = byte(ts & 0xff)
	// ssrc
	head[8] = byte(ssrc >> 24)
	head[9] = byte(ssrc >> 16)
	head[10] = byte(ssrc >> 8)
	head[11] = byte(ssrc & 0xff)
	pkt := append(head, payload...)
	return pkt
}
