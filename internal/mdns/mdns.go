// Package mdns provides a minimal RFC 6762/6763 mDNS responder and query client.
//
// Why not pion/mdns: pion is designed for WebRTC ICE candidate resolution. It
// only responds to explicit A/AAAA queries and never sends proactive
// announcements (RFC 6762 §8.3) or DNS-SD service records (RFC 6763).
// Clients that rely on passive listening (Android NSD, iOS Bonjour, avahi-browse)
// therefore can't discover us.
package mdns

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"reflect"
	"strings"
	"sync"
	"syscall"
	"time"

	"kvm/internal/logging"

	"github.com/rs/zerolog"
	"golang.org/x/net/dns/dnsmessage"
	"golang.org/x/net/ipv4"
)

const (
	mdnsGroupIPv4    = "224.0.0.251"
	mdnsPort         = 5353
	responseTTL      = 4500 // RFC 6762 §11.3: 75 min for unique records
	announceInterval = 45 * time.Second

	// classCacheFlush is ClassINET with the cache-flush bit set (bit 15).
	// RFC 6762 §11.3: set on unique records in responses so peers flush stale
	// cached entries. Android's mDNS daemon requires this to cache A records.
	// PTR records are shared (multiple hosts can answer), so they don't get it.
	classCacheFlush = dnsmessage.Class(dnsmessage.ClassINET | 0x8000)
)

var mdnsGroupAddr = &net.UDPAddr{IP: net.ParseIP(mdnsGroupIPv4), Port: mdnsPort}

// Service describes a DNS-SD service to advertise (RFC 6763).
type Service struct {
	Type string   // e.g. "_http._tcp"
	Port uint16   // TCP/UDP port
	TXT  []string // key=value pairs, e.g. "path=/"
}

type pendingQuery struct {
	name       string
	resultChan chan netip.Addr
}

type MDNS struct {
	mu            sync.Mutex
	localNames    []string // normalized: lowercase "foo.local."
	services      []Service
	listenOptions *MDNSListenOptions
	conn          *net.UDPConn
	pconn         *ipv4.PacketConn
	ifaces        []net.Interface
	pending       []*pendingQuery
	stopCh        chan struct{}
	l             *zerolog.Logger
}

type MDNSListenOptions struct {
	IPv4 bool
	IPv6 bool
}

type MDNSOptions struct {
	Logger        *zerolog.Logger
	LocalNames    []string
	Services      []Service // DNS-SD services to advertise
	ListenOptions *MDNSListenOptions
}

func NewMDNS(opts *MDNSOptions) (*MDNS, error) {
	if opts.Logger == nil {
		opts.Logger = logging.GetDefaultLogger()
	}
	if opts.ListenOptions == nil {
		opts.ListenOptions = &MDNSListenOptions{IPv4: true, IPv6: true}
	}
	return &MDNS{
		l:             opts.Logger,
		localNames:    normalizeNames(opts.LocalNames),
		services:      opts.Services,
		listenOptions: opts.ListenOptions,
	}, nil
}

func normalizeNames(names []string) []string {
	result := make([]string, 0, len(names))
	for _, name := range names {
		name = strings.ToLower(strings.TrimRight(name, "."))
		if !strings.HasSuffix(name, ".local") {
			name += ".local"
		}
		result = append(result, name+".")
	}
	return result
}

// instanceName returns the bare hostname from the first localName.
// "picokvm.local." → "picokvm"
func instanceName(localNames []string) string {
	if len(localNames) == 0 {
		return ""
	}
	n := strings.TrimSuffix(localNames[0], ".local.")
	n = strings.TrimSuffix(n, ".local")
	return n
}

func (m *MDNS) start(allowRestart bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.conn != nil {
		if !allowRestart {
			return fmt.Errorf("mDNS already running")
		}
		if m.stopCh != nil {
			close(m.stopCh)
			m.stopCh = nil
		}
		m.conn.Close()
		m.conn = nil
		m.pconn = nil
	}

	if m.listenOptions == nil || !m.listenOptions.IPv4 {
		m.l.Info().Msg("mDNS server disabled (IPv4 not enabled)")
		return nil
	}

	ifaces, err := net.Interfaces()
	if err != nil {
		return fmt.Errorf("listing interfaces: %w", err)
	}
	var usable []net.Interface
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		if ifc.Flags&net.FlagUp == 0 {
			continue
		}
		if ifc.Flags&net.FlagMulticast == 0 {
			continue
		}
		usable = append(usable, ifc)
	}
	if len(usable) == 0 {
		return fmt.Errorf("no multicast-capable interfaces found")
	}

	lc := net.ListenConfig{
		Control: func(_, _ string, c syscall.RawConn) error {
			var innerErr error
			err := c.Control(func(fd uintptr) {
				innerErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			})
			if err != nil {
				return err
			}
			return innerErr
		},
	}
	pc, err := lc.ListenPacket(context.Background(), "udp4", "0.0.0.0:5353")
	if err != nil {
		return fmt.Errorf("bind :5353: %w", err)
	}

	udpConn := pc.(*net.UDPConn)
	pconn := ipv4.NewPacketConn(udpConn)

	if err := pconn.SetControlMessage(ipv4.FlagInterface|ipv4.FlagDst, true); err != nil {
		m.l.Warn().Err(err).Msg("mDNS: failed to enable IPv4 control messages")
	}

	// RFC 6762 §11: mDNS packets must be sent with IP TTL = 255.
	// Android and iOS silently drop multicast mDNS packets with TTL < 255.
	if err := pconn.SetMulticastTTL(255); err != nil {
		m.l.Warn().Err(err).Msg("mDNS: failed to set multicast TTL to 255")
	}

	for i := range usable {
		if err := pconn.JoinGroup(&usable[i], mdnsGroupAddr); err != nil {
			m.l.Warn().Err(err).Str("iface", usable[i].Name).Msg("mDNS: failed to join multicast group")
		}
	}

	m.conn = udpConn
	m.pconn = pconn
	m.ifaces = usable
	m.stopCh = make(chan struct{})

	stopCh := m.stopCh
	go m.readLoop(stopCh)
	go m.announceLoop(stopCh)

	m.l.Info().Interface("names", m.localNames).Msg("mDNS server started")
	return nil
}

func (m *MDNS) Start() error   { return m.start(false) }
func (m *MDNS) Restart() error { return m.start(true) }

func (m *MDNS) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.conn == nil {
		return nil
	}
	if m.stopCh != nil {
		close(m.stopCh)
		m.stopCh = nil
	}
	err := m.conn.Close()
	m.conn = nil
	m.pconn = nil
	return err
}

func (m *MDNS) SetLocalNames(localNames []string, always bool) error {
	normalized := normalizeNames(localNames)

	m.mu.Lock()
	unchanged := reflect.DeepEqual(m.localNames, normalized) && !always
	m.localNames = normalized
	m.mu.Unlock()

	if unchanged {
		return nil
	}
	_ = m.Restart()
	return nil
}

func (m *MDNS) SetListenOptions(lo *MDNSListenOptions) error {
	m.mu.Lock()
	if m.listenOptions != nil &&
		m.listenOptions.IPv4 == lo.IPv4 &&
		m.listenOptions.IPv6 == lo.IPv6 {
		m.mu.Unlock()
		return nil
	}
	m.listenOptions = lo
	m.mu.Unlock()

	_ = m.Restart()
	return nil
}

// readLoop reads all mDNS packets and dispatches them.
func (m *MDNS) readLoop(stopCh chan struct{}) {
	buf := make([]byte, 9000)
	for {
		m.mu.Lock()
		pconn := m.pconn
		m.mu.Unlock()
		if pconn == nil {
			return
		}

		n, cm, src, err := pconn.ReadFrom(buf)
		if err != nil {
			select {
			case <-stopCh:
			default:
				m.l.Warn().Err(err).Msg("mDNS read error")
			}
			return
		}

		ifIndex := 0
		var dstIP net.IP
		if cm != nil {
			ifIndex = cm.IfIndex
			dstIP = cm.Dst
		}
		udpSrc, ok := src.(*net.UDPAddr)
		if !ok {
			continue
		}
		m.handlePacket(append([]byte(nil), buf[:n]...), ifIndex, dstIP, udpSrc)
	}
}

func (m *MDNS) handlePacket(buf []byte, ifIndex int, dstIP net.IP, src *net.UDPAddr) {
	var parser dnsmessage.Parser
	header, err := parser.Start(buf)
	if err != nil {
		return
	}

	m.mu.Lock()
	localNames := m.localNames
	services := m.services
	pconn := m.pconn
	ifaces := m.ifaces
	m.mu.Unlock()

	if pconn == nil {
		return
	}

	if !header.Response {
		questions, err := parser.AllQuestions()
		if err != nil {
			return
		}

		localIP := m.findLocalIPv4(ifIndex, ifaces)
		localIP6 := m.findLocalIPv6(ifIndex, ifaces)
		inst := instanceName(localNames)

		for _, q := range questions {
			qname := strings.ToLower(q.Name.String())

			// Determine response destination per RFC 6762 §6.
			isQU := q.Class&(1<<15) != 0
			isLegacy := src.Port != mdnsPort
			isDirect := len(dstIP) > 0 && !dstIP.Equal(net.ParseIP(mdnsGroupIPv4))
			dst := mdnsGroupAddr
			if isQU || isLegacy || isDirect {
				dst = src
			}

			m.l.Info().
				Str("from", src.String()).
				Str("query_dst", dstIP.String()).
				Str("q", qname).
				Str("type", q.Type.String()).
				Bool("qu", isQU).Bool("legacy", isLegacy).Bool("direct", isDirect).
				Str("will_respond_to", dst.String()).
				Msg("mDNS query received")

			switch q.Type {
			case dnsmessage.TypeAAAA:
				if !localIP6.IsValid() {
					continue
				}
				for _, ln := range localNames {
					if qname == ln {
						m.l.Info().Str("from", src.String()).Str("name", ln).Str("dst", dst.String()).Msg("mDNS AAAA query — sending response")
						m.sendAAAARecord(header.ID, ln, localIP6, ifIndex, dst, pconn, ifaces)
					}
				}

			case dnsmessage.TypeA, dnsmessage.TypeALL:
				// Hostname A (or ANY) query — respond with A and AAAA if available.
				if !localIP.IsValid() {
					continue
				}
				for _, ln := range localNames {
					if qname == ln {
						m.l.Info().Str("from", src.String()).Str("name", ln).Str("dst", dst.String()).Msg("mDNS A query — sending response")
						m.sendARecord(header.ID, ln, localIP, ifIndex, dst, pconn, ifaces)
						if localIP6.IsValid() {
							m.sendAAAARecord(header.ID, ln, localIP6, ifIndex, dst, pconn, ifaces)
						}
					}
				}

			case dnsmessage.TypePTR:
				if !localIP.IsValid() || inst == "" {
					continue
				}
				// _services._dns-sd._udp.local. → list our service types.
				if qname == "_services._dns-sd._udp.local." {
					for _, svc := range services {
						m.sendServiceTypePtr(header.ID, svc.Type, ifIndex, dst, pconn, ifaces)
					}
					continue
				}
				// _http._tcp.local. (or any registered type) → full service record.
				for _, svc := range services {
					if qname == svc.Type+".local." {
						m.sendServiceRecords(header.ID, inst, localIP, localIP6, svc, ifIndex, dst, pconn, ifaces)
					}
				}
			}
		}
		return
	}

	// Incoming response — satisfy pending QueryAddr calls.
	if err := parser.SkipAllQuestions(); err != nil {
		return
	}
	answers, err := parser.AllAnswers()
	if err != nil {
		return
	}
	for _, ans := range answers {
		if ans.Header.Type != dnsmessage.TypeA {
			continue
		}
		aRes, ok := ans.Body.(*dnsmessage.AResource)
		if !ok {
			continue
		}
		ansName := strings.ToLower(ans.Header.Name.String())
		ip, ok := netip.AddrFromSlice(aRes.A[:])
		if !ok {
			continue
		}
		ip = ip.Unmap()

		m.mu.Lock()
		var remaining []*pendingQuery
		for _, pq := range m.pending {
			if pq.name == ansName {
				select {
				case pq.resultChan <- ip:
				default:
				}
			} else {
				remaining = append(remaining, pq)
			}
		}
		m.pending = remaining
		m.mu.Unlock()
	}
}

// findLocalIPv4 returns the IPv4 address for the given interface index,
// falling back to the first non-loopback IPv4 across all usable interfaces.
func (m *MDNS) findLocalIPv4(ifIndex int, ifaces []net.Interface) netip.Addr {
	check := func(ifc net.Interface) (netip.Addr, bool) {
		addrs, _ := ifc.Addrs()
		for _, addr := range addrs {
			var ip net.IP
			switch a := addr.(type) {
			case *net.IPNet:
				ip = a.IP
			case *net.IPAddr:
				ip = a.IP
			}
			if ip4 := ip.To4(); ip4 != nil {
				if nip, ok := netip.AddrFromSlice(ip4); ok {
					return nip.Unmap(), true
				}
			}
		}
		return netip.Addr{}, false
	}

	if ifIndex > 0 {
		for _, ifc := range ifaces {
			if ifc.Index == ifIndex {
				if ip, ok := check(ifc); ok {
					return ip
				}
			}
		}
	}
	for _, ifc := range ifaces {
		if ip, ok := check(ifc); ok {
			return ip
		}
	}
	return netip.Addr{}
}

// findLocalIPv6 returns the best non-link-local IPv6 address (ULA or global)
// for the given interface index, falling back across all usable interfaces.
// Link-local (fe80::) addresses are skipped because they are not routable across
// the WiFi/Ethernet bridge that separates Android clients from PicoKVM.
func (m *MDNS) findLocalIPv6(ifIndex int, ifaces []net.Interface) netip.Addr {
	check := func(ifc net.Interface) (netip.Addr, bool) {
		addrs, _ := ifc.Addrs()
		for _, addr := range addrs {
			var ip net.IP
			switch a := addr.(type) {
			case *net.IPNet:
				ip = a.IP
			case *net.IPAddr:
				ip = a.IP
			}
			if ip.To4() != nil || len(ip) != 16 {
				continue
			}
			if ip.IsLinkLocalUnicast() || ip.IsLoopback() {
				continue
			}
			if nip, ok := netip.AddrFromSlice(ip); ok {
				return nip.Unmap(), true
			}
		}
		return netip.Addr{}, false
	}

	if ifIndex > 0 {
		for _, ifc := range ifaces {
			if ifc.Index == ifIndex {
				if ip, ok := check(ifc); ok {
					return ip
				}
			}
		}
	}
	for _, ifc := range ifaces {
		if ip, ok := check(ifc); ok {
			return ip
		}
	}
	return netip.Addr{}
}

func (m *MDNS) sendARecord(queryID uint16, name string, ip netip.Addr, ifIndex int, dst *net.UDPAddr, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	packed, err := dnsmessage.NewName(name)
	if err != nil {
		return
	}
	ipBytes := ip.As4()
	msg := dnsmessage.Message{
		Header: dnsmessage.Header{ID: queryID, Response: true, Authoritative: true},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: packed, Type: dnsmessage.TypeA, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.AResource{A: ipBytes},
		}},
	}
	raw, err := msg.Pack()
	if err != nil {
		return
	}
	m.writePacket(raw, dst, ifIndex, pconn, ifaces)
}

func (m *MDNS) sendAAAARecord(queryID uint16, name string, ip netip.Addr, ifIndex int, dst *net.UDPAddr, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	packed, err := dnsmessage.NewName(name)
	if err != nil {
		return
	}
	ipBytes := ip.As16()
	msg := dnsmessage.Message{
		Header: dnsmessage.Header{ID: queryID, Response: true, Authoritative: true},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: packed, Type: dnsmessage.TypeAAAA, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.AAAAResource{AAAA: ipBytes},
		}},
	}
	raw, err := msg.Pack()
	if err != nil {
		return
	}
	m.writePacket(raw, dst, ifIndex, pconn, ifaces)
}

// sendServiceTypePtr responds to _services._dns-sd._udp.local. with a PTR for svcType.
func (m *MDNS) sendServiceTypePtr(queryID uint16, svcType string, ifIndex int, dst *net.UDPAddr, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	svcFQDN := svcType + ".local."
	enum := "_services._dns-sd._udp.local."

	enumPacked, err := dnsmessage.NewName(enum)
	if err != nil {
		return
	}
	svcPacked, err := dnsmessage.NewName(svcFQDN)
	if err != nil {
		return
	}
	msg := dnsmessage.Message{
		Header: dnsmessage.Header{ID: queryID, Response: true, Authoritative: true},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: enumPacked, Type: dnsmessage.TypePTR, Class: dnsmessage.ClassINET, TTL: responseTTL},
			Body:   &dnsmessage.PTRResource{PTR: svcPacked},
		}},
	}
	raw, err := msg.Pack()
	if err != nil {
		return
	}
	m.writePacket(raw, dst, ifIndex, pconn, ifaces)
}

// sendServiceRecords sends PTR + SRV + TXT + A (+ AAAA if available) for a service in response to a PTR query.
func (m *MDNS) sendServiceRecords(queryID uint16, inst string, ip netip.Addr, ip6 netip.Addr, svc Service, ifIndex int, dst *net.UDPAddr, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	raw := m.buildServiceMsg(queryID, inst, ip, ip6, svc)
	if raw != nil {
		m.writePacket(raw, dst, ifIndex, pconn, ifaces)
	}
}

// buildServiceMsg builds a DNS-SD announcement with ALL records in the Answers
// section, matching Avahi's wire format. RFC 6763 §12 says put SRV/TXT/A in
// Additional, but Android's mDNS daemon only caches A records it finds in the
// Answers section of unsolicited announcements — it ignores Additional for
// proactive announcements. Avahi (which works everywhere) puts everything in
// Answers; we match that behaviour.
//
// ip6 may be the zero value when no non-link-local IPv6 address is available;
// in that case no AAAA record is included.
func (m *MDNS) buildServiceMsg(queryID uint16, inst string, ip netip.Addr, ip6 netip.Addr, svc Service) []byte {
	hostFQDN := inst + ".local."
	svcFQDN := svc.Type + ".local."
	instFQDN := inst + "." + svcFQDN // e.g. "picokvm._http._tcp.local."

	hostPacked, err := dnsmessage.NewName(hostFQDN)
	if err != nil {
		return nil
	}
	svcPacked, err := dnsmessage.NewName(svcFQDN)
	if err != nil {
		return nil
	}
	instPacked, err := dnsmessage.NewName(instFQDN)
	if err != nil {
		return nil
	}

	txtStrings := svc.TXT
	if len(txtStrings) == 0 {
		txtStrings = []string{""} // RFC 6763: at least one string required
	}

	ipBytes := ip.As4()
	answers := []dnsmessage.Resource{
		// PTR — shared record, no cache-flush bit
		{
			Header: dnsmessage.ResourceHeader{Name: svcPacked, Type: dnsmessage.TypePTR, Class: dnsmessage.ClassINET, TTL: responseTTL},
			Body:   &dnsmessage.PTRResource{PTR: instPacked},
		},
		// SRV, TXT, A — unique records, cache-flush bit set
		{
			Header: dnsmessage.ResourceHeader{Name: instPacked, Type: dnsmessage.TypeSRV, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.SRVResource{Priority: 0, Weight: 0, Port: svc.Port, Target: hostPacked},
		},
		{
			Header: dnsmessage.ResourceHeader{Name: instPacked, Type: dnsmessage.TypeTXT, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.TXTResource{TXT: txtStrings},
		},
		{
			Header: dnsmessage.ResourceHeader{Name: hostPacked, Type: dnsmessage.TypeA, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.AResource{A: ipBytes},
		},
	}
	if ip6.IsValid() {
		ip6Bytes := ip6.As16()
		answers = append(answers, dnsmessage.Resource{
			Header: dnsmessage.ResourceHeader{Name: hostPacked, Type: dnsmessage.TypeAAAA, Class: classCacheFlush, TTL: responseTTL},
			Body:   &dnsmessage.AAAAResource{AAAA: ip6Bytes},
		})
	}

	msg := dnsmessage.Message{
		Header:  dnsmessage.Header{ID: queryID, Response: true, Authoritative: true},
		Answers: answers,
	}
	raw, err := msg.Pack()
	if err != nil {
		return nil
	}
	return raw
}

func (m *MDNS) writePacket(raw []byte, dst *net.UDPAddr, ifIndex int, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	if dst.IP.Equal(net.ParseIP(mdnsGroupIPv4)) {
		for i := range ifaces {
			if ifIndex > 0 && ifaces[i].Index != ifIndex {
				continue
			}
			if err := pconn.SetMulticastInterface(&ifaces[i]); err != nil {
				continue
			}
			if _, err := pconn.WriteTo(raw, nil, dst); err != nil {
				m.l.Warn().Err(err).Str("iface", ifaces[i].Name).Msg("mDNS multicast write failed")
			}
		}
	} else {
		if _, err := pconn.WriteTo(raw, nil, dst); err != nil {
			m.l.Warn().Err(err).Str("dst", dst.String()).Msg("mDNS unicast write failed")
		}
	}
}

// announceLoop sends proactive mDNS announcements (RFC 6762 §8.3 + RFC 6763).
// This is what makes us discoverable to passive listeners (Android, iOS, etc.)
// without them needing to send an explicit query first.
func (m *MDNS) announceLoop(stopCh chan struct{}) {
	// At boot the interface IP may not be assigned yet. Retry every 3 s.
	for {
		if m.sendAnnounce() {
			break
		}
		select {
		case <-stopCh:
			return
		case <-time.After(3 * time.Second):
		}
	}
	// Second announcement 1 s after the first per RFC 6762 §8.3.
	select {
	case <-stopCh:
		return
	case <-time.After(time.Second):
	}
	m.sendAnnounce()

	ticker := time.NewTicker(announceInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			m.sendAnnounce()
		}
	}
}

// sendAnnounce broadcasts A + DNS-SD records for all registered services.
func (m *MDNS) sendAnnounce() bool {
	m.mu.Lock()
	localNames := m.localNames
	services := m.services
	pconn := m.pconn
	ifaces := m.ifaces
	m.mu.Unlock()

	if pconn == nil || len(localNames) == 0 {
		return false
	}
	localIP := m.findLocalIPv4(0, ifaces)
	if !localIP.IsValid() {
		m.l.Warn().Msg("mDNS announce: no local IPv4 found, will retry")
		return false
	}
	localIP6 := m.findLocalIPv6(0, ifaces)

	inst := instanceName(localNames)

	// A (and AAAA if available) record announcements for the hostname.
	for _, name := range localNames {
		m.sendARecord(0, name, localIP, 0, mdnsGroupAddr, pconn, ifaces)
		if localIP6.IsValid() {
			m.sendAAAARecord(0, name, localIP6, 0, mdnsGroupAddr, pconn, ifaces)
		}
	}

	// DNS-SD service announcements (PTR + SRV + TXT + A [+ AAAA]).
	for _, svc := range services {
		raw := m.buildServiceMsg(0, inst, localIP, localIP6, svc)
		if raw != nil {
			m.writePacket(raw, mdnsGroupAddr, 0, pconn, ifaces)
		}
	}

	m.l.Info().Str("ip", localIP.String()).Str("ip6", localIP6.String()).Str("instance", inst).
		Interface("names", localNames).Interface("services", services).
		Msg("mDNS announcement sent")
	return true
}

// QueryAddr resolves a .local hostname to an IPv4 address via mDNS.
func (m *MDNS) QueryAddr(ctx context.Context, name string) (netip.Addr, error) {
	normalized := strings.ToLower(strings.TrimRight(name, ".")) + "."

	m.mu.Lock()
	pconn := m.pconn
	ifaces := m.ifaces
	m.mu.Unlock()

	if pconn == nil {
		return netip.Addr{}, fmt.Errorf("mDNS not initialized")
	}

	resultChan := make(chan netip.Addr, 1)
	pq := &pendingQuery{name: normalized, resultChan: resultChan}

	m.mu.Lock()
	m.pending = append(m.pending, pq)
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		for i, q := range m.pending {
			if q == pq {
				m.pending = append(m.pending[:i], m.pending[i+1:]...)
				break
			}
		}
		m.mu.Unlock()
	}()

	sendQ := func() { m.sendQuery(normalized, pconn, ifaces) }
	sendQ()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return netip.Addr{}, fmt.Errorf("mDNS query timed out for %s", name)
		case ip := <-resultChan:
			return ip, nil
		case <-ticker.C:
			sendQ()
		}
	}
}

func (m *MDNS) sendQuery(name string, pconn *ipv4.PacketConn, ifaces []net.Interface) {
	packed, err := dnsmessage.NewName(name)
	if err != nil {
		return
	}
	msg := dnsmessage.Message{
		Questions: []dnsmessage.Question{{
			Name:  packed,
			Type:  dnsmessage.TypeA,
			Class: dnsmessage.ClassINET | (1 << 15), // QU bit
		}},
	}
	raw, err := msg.Pack()
	if err != nil {
		return
	}
	for i := range ifaces {
		if err := pconn.SetMulticastInterface(&ifaces[i]); err != nil {
			continue
		}
		if _, err := pconn.WriteTo(raw, nil, mdnsGroupAddr); err != nil {
			m.l.Warn().Err(err).Str("iface", ifaces[i].Name).Msg("mDNS query send failed")
		}
	}
}
