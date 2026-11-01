package kvm

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const (
	firewallChainInput   = "KVM_UI_INPUT"
	firewallChainOutput  = "KVM_UI_OUTPUT"
	firewallChainForward = "KVM_UI_FORWARD"

	firewallChainNatPrerouting  = "KVM_UI_PREROUTING"
	firewallChainNatPostrouting = "KVM_UI_POSTROUTING"

	firewallNatOutputCommentPrefix = "KVM_UI_PF"
)

func ApplyFirewallConfig(cfg *FirewallConfig) error {
	if cfg == nil {
		return nil
	}

	if _, err := exec.LookPath("iptables"); err != nil {
		return fmt.Errorf("iptables not found: %w", err)
	}

	if err := validateFirewallConfig(cfg); err != nil {
		return err
	}

	needPortForward := len(cfg.PortForwards) > 0
	natSupported, err := iptablesTableSupported("nat")
	if err != nil {
		return err
	}
	if needPortForward && !natSupported {
		return fmt.Errorf("iptables nat table not supported; port forwarding unavailable")
	}

	manageNat := natSupported

	if err := ensureFirewallChains(manageNat); err != nil {
		return err
	}

	if err := flushFirewallChains(manageNat); err != nil {
		return err
	}

	if err := ensureFirewallJumps(manageNat); err != nil {
		return err
	}

	if err := buildBaseRules(cfg.Base); err != nil {
		return err
	}

	if err := buildCommunicationRules(cfg.Rules); err != nil {
		return err
	}

	if err := buildPortForwardRules(cfg.PortForwards, manageNat); err != nil {
		return err
	}

	if err := appendDefaultPolicies(cfg.Base); err != nil {
		return err
	}

	return nil
}

func validateFirewallConfig(cfg *FirewallConfig) error {
	policies := []struct {
		name  string
		value string
	}{
		{"inputPolicy", cfg.Base.InputPolicy},
		{"outputPolicy", cfg.Base.OutputPolicy},
		{"forwardPolicy", cfg.Base.ForwardPolicy},
	}
	for _, p := range policies {
		if _, err := normalizeFirewallAction(p.value); err != nil {
			return fmt.Errorf("invalid %s: %w", p.name, err)
		}
	}

	for i, r := range cfg.Rules {
		if _, err := normalizeFirewallChain(r.Chain); err != nil {
			return fmt.Errorf("rules[%d].chain: %w", i, err)
		}
		if r.SourceIP != "" && !isValidIPOrCIDR(r.SourceIP) {
			return fmt.Errorf("rules[%d].sourceIP: invalid ip", i)
		}
		if r.DestinationIP != "" && !isValidIPOrCIDR(r.DestinationIP) {
			return fmt.Errorf("rules[%d].destinationIP: invalid ip", i)
		}
		if r.SourcePort != nil && (*r.SourcePort < 1 || *r.SourcePort > 65535) {
			return fmt.Errorf("rules[%d].sourcePort: out of range", i)
		}
		if r.DestinationPort != nil && (*r.DestinationPort < 1 || *r.DestinationPort > 65535) {
			return fmt.Errorf("rules[%d].destinationPort: out of range", i)
		}
		if len(r.Protocols) == 0 {
			return fmt.Errorf("rules[%d].protocols: required", i)
		}
		for _, proto := range r.Protocols {
			if _, err := normalizeFirewallProtocol(proto); err != nil {
				return fmt.Errorf("rules[%d].protocols: %w", i, err)
			}
		}
		if _, err := normalizeFirewallAction(r.Action); err != nil {
			return fmt.Errorf("rules[%d].action: %w", i, err)
		}
	}

	for i, r := range cfg.PortForwards {
		if !isManagedPortForward(r) {
			continue
		}
		chain := strings.ToLower(strings.TrimSpace(r.Chain))
		if chain == "" {
			if isLocalRedirectDestination(r.DestinationIP) {
				chain = "output"
			} else {
				chain = "prerouting"
			}
		}
		if chain != "output" && chain != "prerouting" && chain != "prerouting_redirect" {
			return fmt.Errorf("portForwards[%d].chain: unsupported", i)
		}
		if r.SourcePort < 1 || r.SourcePort > 65535 {
			return fmt.Errorf("portForwards[%d].sourcePort: out of range", i)
		}
		if r.DestinationPort < 1 || r.DestinationPort > 65535 {
			return fmt.Errorf("portForwards[%d].destinationPort: out of range", i)
		}
		if chain == "prerouting" {
			ip := net.ParseIP(r.DestinationIP)
			if ip == nil {
				return fmt.Errorf("portForwards[%d].destinationIP: invalid ip", i)
			}
			if ip.IsUnspecified() {
				return fmt.Errorf("portForwards[%d].destinationIP: invalid ip", i)
			}
		}
		if chain != "prerouting" && r.DestinationIP != "" && net.ParseIP(r.DestinationIP) == nil {
			return fmt.Errorf("portForwards[%d].destinationIP: invalid ip", i)
		}
		if len(r.Protocols) == 0 {
			return fmt.Errorf("portForwards[%d].protocols: required", i)
		}
		for _, proto := range r.Protocols {
			if _, err := normalizeFirewallProtocol(proto); err != nil {
				return fmt.Errorf("portForwards[%d].protocols: %w", i, err)
			}
			switch strings.ToLower(strings.TrimSpace(proto)) {
			case "tcp", "udp", "sctp", "dccp":
			default:
				return fmt.Errorf("portForwards[%d].protocols: %s not supported for port forwarding", i, proto)
			}
		}
	}

	return nil
}

func isManagedPortForward(r FirewallPortRule) bool {
	return r.Managed == nil || *r.Managed
}

func isValidIPOrCIDR(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return false
	}
	if strings.Contains(t, "/") {
		_, _, err := net.ParseCIDR(t)
		return err == nil
	}
	return net.ParseIP(t) != nil
}

func ensureFirewallChains(needNat bool) error {
	for _, chain := range []string{firewallChainInput, firewallChainOutput, firewallChainForward} {
		if err := ensureChain("filter", chain); err != nil {
			return err
		}
	}
	if needNat {
		for _, chain := range []string{firewallChainNatPrerouting, firewallChainNatPostrouting} {
			if err := ensureChain("nat", chain); err != nil {
				return err
			}
		}
	}
	return nil
}

func flushFirewallChains(needNat bool) error {
	for _, chain := range []string{firewallChainInput, firewallChainOutput, firewallChainForward} {
		if err := iptables("filter", "-F", chain); err != nil {
			return err
		}
	}
	if needNat {
		for _, chain := range []string{firewallChainNatPrerouting, firewallChainNatPostrouting} {
			if err := iptables("nat", "-F", chain); err != nil {
				return err
			}
		}
	}
	return nil
}

func ensureFirewallJumps(needNat bool) error {
	if err := ensureJump("filter", "INPUT", firewallChainInput); err != nil {
		return err
	}
	if err := ensureJump("filter", "OUTPUT", firewallChainOutput); err != nil {
		return err
	}
	if err := ensureJump("filter", "FORWARD", firewallChainForward); err != nil {
		return err
	}
	if needNat {
		if err := ensureJump("nat", "PREROUTING", firewallChainNatPrerouting); err != nil {
			return err
		}
		if err := ensureJump("nat", "POSTROUTING", firewallChainNatPostrouting); err != nil {
			return err
		}
	}
	return nil
}

func iptablesTableSupported(table string) (bool, error) {
	err := iptables(table, "-S")
	if err == nil {
		return true, nil
	}
	if isIptablesTableMissingErr(err) {
		return false, nil
	}
	return false, err
}

func isIptablesTableMissingErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if strings.Contains(msg, "Table does not exist") {
		return true
	}
	if strings.Contains(msg, "can't initialize iptables table") {
		return true
	}
	return false
}

func buildBaseRules(base FirewallBaseRule) error {
	if err := iptables("filter", "-A", firewallChainInput, "-i", "lo", "-j", "ACCEPT"); err != nil {
		return err
	}
	if err := iptables("filter", "-A", firewallChainOutput, "-o", "lo", "-j", "ACCEPT"); err != nil {
		return err
	}

	for _, chain := range []string{firewallChainInput, firewallChainOutput, firewallChainForward} {
		if err := iptables("filter", "-A", chain, "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT"); err != nil {
			return err
		}
	}

	return nil
}

func appendDefaultPolicies(base FirewallBaseRule) error {
	inputDefault, err := normalizeFirewallAction(base.InputPolicy)
	if err != nil {
		return err
	}
	outputDefault, err := normalizeFirewallAction(base.OutputPolicy)
	if err != nil {
		return err
	}
	forwardDefault, err := normalizeFirewallAction(base.ForwardPolicy)
	if err != nil {
		return err
	}

	if err := iptables("filter", "-A", firewallChainInput, "-j", inputDefault); err != nil {
		return err
	}
	if err := iptables("filter", "-A", firewallChainOutput, "-j", outputDefault); err != nil {
		return err
	}
	if err := iptables("filter", "-A", firewallChainForward, "-j", forwardDefault); err != nil {
		return err
	}

	return nil
}

func buildCommunicationRules(rules []FirewallRule) error {
	for _, r := range rules {
		chain, err := normalizeFirewallChain(r.Chain)
		if err != nil {
			return err
		}
		target, err := normalizeFirewallAction(r.Action)
		if err != nil {
			return err
		}

		protos, err := normalizeProtocolList(r.Protocols)
		if err != nil {
			return err
		}

		for _, proto := range protos {
			args := []string{"-A", chain}
			if r.SourceIP != "" {
				args = append(args, "-s", r.SourceIP)
			}
			if r.DestinationIP != "" {
				args = append(args, "-d", r.DestinationIP)
			}
			if proto != "" {
				args = append(args, "-p", proto)
			}
			if r.SourcePort != nil && protoSupportsPorts(proto) {
				args = append(args, "--sport", strconv.Itoa(*r.SourcePort))
			}
			if r.DestinationPort != nil && protoSupportsPorts(proto) {
				args = append(args, "--dport", strconv.Itoa(*r.DestinationPort))
			}
			if strings.TrimSpace(r.Comment) != "" {
				args = append(args, "-m", "comment", "--comment", r.Comment)
			}
			args = append(args, "-j", target)
			if err := iptables("filter", args...); err != nil {
				return err
			}
		}
	}
	return nil
}

func buildPortForwardRules(rules []FirewallPortRule, manageNat bool) error {
	if !manageNat {
		return nil
	}

	if err := clearManagedNatOutputRules(); err != nil {
		return err
	}

	localRedirects := make([]FirewallPortRule, 0)
	preroutingRedirects := make([]FirewallPortRule, 0)
	dnatForwards := make([]FirewallPortRule, 0)
	for _, r := range rules {
		if !isManagedPortForward(r) {
			continue
		}
		chain := strings.ToLower(strings.TrimSpace(r.Chain))
		if chain == "" {
			if isLocalRedirectDestination(r.DestinationIP) {
				chain = "output"
			} else {
				chain = "prerouting"
			}
		}
		if chain == "output" {
			localRedirects = append(localRedirects, r)
		} else if chain == "prerouting_redirect" {
			preroutingRedirects = append(preroutingRedirects, r)
		} else {
			dnatForwards = append(dnatForwards, r)
		}
	}

	if err := buildNatOutputRedirectRules(localRedirects); err != nil {
		return err
	}
	if err := buildNatPreroutingRedirectRules(preroutingRedirects); err != nil {
		return err
	}

	if len(dnatForwards) == 0 {
		return nil
	}

	if err := sysctlWrite("net.ipv4.ip_forward", "1"); err != nil {
		logger.Warn().Err(err).Msg("failed to enable ip_forward")
	}

	if err := iptables("nat", "-A", firewallChainNatPostrouting, "-m", "conntrack", "--ctstate", "DNAT", "-j", "MASQUERADE"); err != nil {
		return err
	}

	for _, r := range dnatForwards {
		protos, err := normalizeProtocolList(r.Protocols)
		if err != nil {
			return err
		}

		for _, proto := range protos {
			if proto == "" {
				continue
			}

			preroutingArgs := []string{
				"-A", firewallChainNatPrerouting,
				"-p", proto,
				"--dport", strconv.Itoa(r.SourcePort),
			}
			if strings.TrimSpace(r.Comment) != "" {
				preroutingArgs = append(preroutingArgs, "-m", "comment", "--comment", r.Comment)
			}
			preroutingArgs = append(
				preroutingArgs,
				"-j", "DNAT",
				"--to-destination", fmt.Sprintf("%s:%d", r.DestinationIP, r.DestinationPort),
			)
			if err := iptables("nat", preroutingArgs...); err != nil {
				return err
			}

			forwardArgs := []string{
				"-A", firewallChainForward,
				"-p", proto,
				"-d", r.DestinationIP,
				"--dport", strconv.Itoa(r.DestinationPort),
				"-m", "conntrack",
				"--ctstate", "NEW,ESTABLISHED,RELATED",
			}
			if strings.TrimSpace(r.Comment) != "" {
				forwardArgs = append(forwardArgs, "-m", "comment", "--comment", r.Comment)
			}
			forwardArgs = append(forwardArgs, "-j", "ACCEPT")
			if err := iptables("filter", forwardArgs...); err != nil {
				return err
			}
		}
	}

	return nil
}

func buildNatPreroutingRedirectRules(rules []FirewallPortRule) error {
	for _, r := range rules {
		protos, err := normalizeProtocolList(r.Protocols)
		if err != nil {
			return err
		}
		for _, proto := range protos {
			if proto == "" {
				continue
			}
			args := []string{
				"-A", firewallChainNatPrerouting,
				"-p", proto,
				"--dport", strconv.Itoa(r.SourcePort),
			}
			if strings.TrimSpace(r.Comment) != "" {
				args = append(args, "-m", "comment", "--comment", r.Comment)
			}
			args = append(
				args,
				"-j", "REDIRECT",
				"--to-ports", strconv.Itoa(r.DestinationPort),
			)
			if err := iptables("nat", args...); err != nil {
				return err
			}
		}
	}
	return nil
}

func isLocalRedirectDestination(dstIP string) bool {
	switch strings.TrimSpace(dstIP) {
	case "0.0.0.0", "127.0.0.1":
		return true
	default:
		return false
	}
}

func clearManagedNatOutputRules() error {
	out, err := iptablesOutput("nat", "-S", "OUTPUT")
	if err != nil {
		if isIptablesTableMissingErr(err) {
			return nil
		}
		return err
	}

	lines := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "-A OUTPUT ") {
			continue
		}
		if !strings.Contains(line, "--comment") {
			continue
		}
		if !strings.Contains(line, firewallNatOutputCommentPrefix) {
			continue
		}
		tokens, err := splitShellLike(line)
		if err != nil || len(tokens) < 2 {
			continue
		}
		if tokens[0] != "-A" || tokens[1] != "OUTPUT" {
			continue
		}
		tokens[0] = "-D"
		_ = iptables("nat", tokens...)
	}
	return nil
}

func buildNatOutputRedirectRules(rules []FirewallPortRule) error {
	for _, r := range rules {
		protos, err := normalizeProtocolList(r.Protocols)
		if err != nil {
			return err
		}
		comment := formatManagedPortForwardComment(r.Comment)
		for _, proto := range protos {
			if proto == "" {
				continue
			}
			args := []string{
				"-A", "OUTPUT",
				"-p", proto,
				"--dport", strconv.Itoa(r.SourcePort),
				"-m", "comment", "--comment", comment,
				"-j", "REDIRECT",
				"--to-ports", strconv.Itoa(r.DestinationPort),
			}
			if err := iptables("nat", args...); err != nil {
				return err
			}
		}
	}
	return nil
}

func formatManagedPortForwardComment(userComment string) string {
	c := strings.TrimSpace(userComment)
	if c == "" {
		return firewallNatOutputCommentPrefix
	}
	return firewallNatOutputCommentPrefix + ":" + c
}

func normalizeFirewallChain(chain string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(chain)) {
	case "input":
		return firewallChainInput, nil
	case "output":
		return firewallChainOutput, nil
	case "forward":
		return firewallChainForward, nil
	default:
		return "", fmt.Errorf("unsupported chain %q", chain)
	}
}

func normalizeFirewallAction(action string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "accept":
		return "ACCEPT", nil
	case "drop":
		return "DROP", nil
	case "reject":
		return "REJECT", nil
	default:
		return "", fmt.Errorf("unsupported action %q", action)
	}
}

func normalizeFirewallProtocol(proto string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(proto)) {
	case "any":
		return "", nil
	case "tcp", "udp", "icmp", "igmp", "sctp", "dccp":
		return strings.ToLower(strings.TrimSpace(proto)), nil
	default:
		return "", fmt.Errorf("unsupported protocol %q", proto)
	}
}

func normalizeProtocolList(protos []string) ([]string, error) {
	hasAny := false
	normalized := make([]string, 0, len(protos))
	for _, p := range protos {
		np, err := normalizeFirewallProtocol(p)
		if err != nil {
			return nil, err
		}
		if np == "" {
			hasAny = true
			continue
		}
		normalized = append(normalized, np)
	}
	if hasAny {
		return []string{""}, nil
	}
	if len(normalized) == 0 {
		return []string{""}, nil
	}
	return normalized, nil
}

func protoSupportsPorts(proto string) bool {
	switch proto {
	case "tcp", "udp", "sctp", "dccp":
		return true
	default:
		return false
	}
}

func ensureChain(table, chain string) error {
	if err := iptables(table, "-nL", chain); err == nil {
		return nil
	}

	err := iptables(table, "-N", chain)
	if err == nil {
		return nil
	}

	if strings.Contains(err.Error(), "Chain already exists") {
		return nil
	}

	return err
}

func ensureJump(table, fromChain, toChain string) error {
	checkErr := iptables(table, "-C", fromChain, "-j", toChain)
	if checkErr == nil {
		return nil
	}

	return iptables(table, "-I", fromChain, "1", "-j", toChain)
}

func iptables(table string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	allArgs := append([]string{}, args...)
	cmd := exec.CommandContext(ctx, "iptables", append([]string{"-t", table}, allArgs...)...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("iptables timeout: %s", strings.Join(append([]string{"-t", table}, allArgs...), " "))
	}
	return fmt.Errorf("iptables failed: %s: %w: %s", strings.Join(append([]string{"-t", table}, allArgs...), " "), err, strings.TrimSpace(string(out)))
}

func sysctlWrite(key, value string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sysctl", "-w", fmt.Sprintf("%s=%s", key, value))
	out, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}
	return fmt.Errorf("sysctl failed: %w: %s", err, strings.TrimSpace(string(out)))
}

func iptablesOutput(table string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "iptables", append([]string{"-t", table}, args...)...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return string(out), nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "", fmt.Errorf("iptables timeout: %s", strings.Join(append([]string{"-t", table}, args...), " "))
	}
	return "", fmt.Errorf("iptables failed: %s: %w: %s", strings.Join(append([]string{"-t", table}, args...), " "), err, strings.TrimSpace(string(out)))
}

func splitShellLike(s string) ([]string, error) {
	var out []string
	var cur strings.Builder
	inQuote := false
	quoteChar := byte(0)
	esc := false

	b := []byte(strings.TrimSpace(s))
	for i := 0; i < len(b); i++ {
		ch := b[i]
		if esc {
			cur.WriteByte(ch)
			esc = false
			continue
		}
		if ch == '\\' {
			esc = true
			continue
		}
		if inQuote {
			if ch == quoteChar {
				inQuote = false
				continue
			}
			cur.WriteByte(ch)
			continue
		}
		if ch == '"' || ch == '\'' {
			inQuote = true
			quoteChar = ch
			continue
		}
		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
			if cur.Len() > 0 {
				out = append(out, cur.String())
				cur.Reset()
			}
			continue
		}
		cur.WriteByte(ch)
	}
	if esc {
		return nil, fmt.Errorf("unterminated escape")
	}
	if inQuote {
		return nil, fmt.Errorf("unterminated quote")
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out, nil
}

func boolPtr(v bool) *bool {
	return &v
}

type iptablesParsedRule struct {
	chain    string
	srcIP    string
	dstIP    string
	proto    string
	sport    *int
	dport    *int
	toPorts  *int
	jump     string
	inIface  string
	outIface string
	ctstate  string
	toDest   string
	comment  string
}

func ReadFirewallConfigFromSystem() (*FirewallConfig, error) {
	if _, err := exec.LookPath("iptables"); err != nil {
		return nil, fmt.Errorf("iptables not found: %w", err)
	}

	inputLines, exists, err := iptablesChainSpecLines("filter", firewallChainInput)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil
	}

	outputLines, _, err := iptablesChainSpecLines("filter", firewallChainOutput)
	if err != nil {
		return nil, err
	}
	forwardLines, _, err := iptablesChainSpecLines("filter", firewallChainForward)
	if err != nil {
		return nil, err
	}

	preroutingLines, _, err := iptablesChainSpecLines("nat", firewallChainNatPrerouting)
	if err != nil {
		return nil, err
	}
	systemPreroutingLines, _, err := iptablesChainSpecLines("nat", "PREROUTING")
	if err != nil {
		return nil, err
	}
	natOutputLines, _, err := iptablesChainSpecLines("nat", "OUTPUT")
	if err != nil {
		return nil, err
	}

	inputRules := parseIptablesSpecLines(inputLines)
	outputRules := parseIptablesSpecLines(outputLines)
	forwardRules := parseIptablesSpecLines(forwardLines)
	preroutingRules := parseIptablesSpecLines(preroutingLines)
	systemPreroutingRules := parseIptablesSpecLines(systemPreroutingLines)
	natOutputRules := parseIptablesSpecLines(natOutputLines)

	base := FirewallBaseRule{
		InputPolicy:   chainDefaultPolicy(inputRules),
		OutputPolicy:  chainDefaultPolicy(outputRules),
		ForwardPolicy: chainDefaultPolicy(forwardRules),
	}

	inputRules = stripDefaultPolicyRule(inputRules)
	outputRules = stripDefaultPolicyRule(outputRules)
	forwardRules = stripDefaultPolicyRule(forwardRules)

	portForwards := make([]FirewallPortRule, 0)
	portForwards = append(portForwards, parsePortForwardsFromNat(preroutingRules)...)
	portForwards = append(portForwards, parsePortForwardsFromSystemPrerouting(systemPreroutingRules)...)
	portForwards = append(portForwards, parsePortForwardsFromNatOutput(natOutputRules)...)
	portForwards = append(portForwards, parsePortForwardsFromSystemNatOutput(natOutputRules)...)
	forwardRules = filterAutoForwardRules(forwardRules, portForwards)

	commRules := make([]FirewallRule, 0)
	commRules = append(commRules, parseCommRulesFromChain("input", inputRules)...)
	commRules = append(commRules, parseCommRulesFromChain("output", outputRules)...)
	commRules = append(commRules, parseCommRulesFromChain("forward", forwardRules)...)

	commRules = groupFirewallRules(commRules)
	portForwards = groupPortForwards(portForwards)

	return &FirewallConfig{
		Base:         base,
		Rules:        commRules,
		PortForwards: portForwards,
	}, nil
}

func iptablesChainSpecLines(table, chain string) ([]string, bool, error) {
	out, err := iptablesOutput(table, "-S", chain)
	if err == nil {
		lines := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
		res := make([]string, 0, len(lines))
		for _, l := range lines {
			l = strings.TrimSpace(l)
			if l == "" {
				continue
			}
			if strings.HasPrefix(l, "-A ") {
				res = append(res, l)
			}
		}
		return res, true, nil
	}

	msg := err.Error()
	if isIptablesTableMissingErr(err) {
		return nil, false, nil
	}
	if strings.Contains(msg, "No chain/target/match by that name") || strings.Contains(msg, "No such file") {
		return nil, false, nil
	}

	return nil, false, err
}

func parseIptablesSpecLines(lines []string) []iptablesParsedRule {
	out := make([]iptablesParsedRule, 0, len(lines))
	for _, line := range lines {
		tokens, err := splitShellLike(line)
		if err != nil {
			continue
		}
		r := parseIptablesTokens(tokens)
		if r.chain == "" {
			continue
		}
		out = append(out, r)
	}
	return out
}

func parseIptablesTokens(tokens []string) iptablesParsedRule {
	var r iptablesParsedRule
	for i := 0; i < len(tokens); i++ {
		switch tokens[i] {
		case "-A":
			if i+1 < len(tokens) {
				r.chain = tokens[i+1]
				i++
			}
		case "-s":
			if i+1 < len(tokens) {
				r.srcIP = tokens[i+1]
				i++
			}
		case "-d":
			if i+1 < len(tokens) {
				r.dstIP = tokens[i+1]
				i++
			}
		case "-p":
			if i+1 < len(tokens) {
				r.proto = strings.ToLower(strings.TrimSpace(tokens[i+1]))
				i++
			}
		case "--sport", "--source-port":
			if i+1 < len(tokens) {
				if v, err := strconv.Atoi(tokens[i+1]); err == nil {
					r.sport = &v
				}
				i++
			}
		case "--dport", "--destination-port":
			if i+1 < len(tokens) {
				if v, err := strconv.Atoi(tokens[i+1]); err == nil {
					r.dport = &v
				}
				i++
			}
		case "-j":
			if i+1 < len(tokens) {
				r.jump = strings.ToUpper(strings.TrimSpace(tokens[i+1]))
				i++
			}
		case "-i":
			if i+1 < len(tokens) {
				r.inIface = tokens[i+1]
				i++
			}
		case "-o":
			if i+1 < len(tokens) {
				r.outIface = tokens[i+1]
				i++
			}
		case "--ctstate":
			if i+1 < len(tokens) {
				r.ctstate = tokens[i+1]
				i++
			}
		case "--to-destination":
			if i+1 < len(tokens) {
				r.toDest = tokens[i+1]
				i++
			}
		case "--to-ports":
			if i+1 < len(tokens) {
				if v, err := strconv.Atoi(tokens[i+1]); err == nil {
					r.toPorts = &v
				}
				i++
			}
		case "--comment":
			if i+1 < len(tokens) {
				r.comment = tokens[i+1]
				i++
			}
		}
	}
	return r
}

func chainDefaultPolicy(rules []iptablesParsedRule) string {
	for i := len(rules) - 1; i >= 0; i-- {
		r := rules[i]
		if isUnconditionalDefaultRule(r) {
			switch r.jump {
			case "ACCEPT":
				return "accept"
			case "DROP":
				return "drop"
			case "REJECT":
				return "reject"
			}
		}
	}
	return "accept"
}

func stripDefaultPolicyRule(rules []iptablesParsedRule) []iptablesParsedRule {
	out := make([]iptablesParsedRule, 0, len(rules))
	for i := 0; i < len(rules); i++ {
		if isUnconditionalDefaultRule(rules[i]) {
			continue
		}
		out = append(out, rules[i])
	}
	return out
}

func isUnconditionalDefaultRule(r iptablesParsedRule) bool {
	if r.jump != "ACCEPT" && r.jump != "DROP" && r.jump != "REJECT" {
		return false
	}
	if r.srcIP != "" || r.dstIP != "" || r.proto != "" || r.sport != nil || r.dport != nil {
		return false
	}
	if r.inIface != "" || r.outIface != "" || r.ctstate != "" || r.toDest != "" {
		return false
	}
	if strings.TrimSpace(r.comment) != "" {
		return false
	}
	return true
}

func parsePortForwardsFromNat(prerouting []iptablesParsedRule) []FirewallPortRule {
	out := make([]FirewallPortRule, 0)
	for _, r := range prerouting {
		if r.dport == nil || r.proto == "" {
			continue
		}
		switch r.jump {
		case "DNAT":
			dstIP, dstPort := parseToDestination(r.toDest)
			if dstIP == "" || dstPort == 0 {
				continue
			}
			out = append(out, FirewallPortRule{
				Chain:           "prerouting",
				Managed:         boolPtr(true),
				SourcePort:      *r.dport,
				Protocols:       []string{r.proto},
				DestinationIP:   dstIP,
				DestinationPort: dstPort,
				Comment:         r.comment,
			})
		case "REDIRECT":
			if r.toPorts == nil {
				continue
			}
			out = append(out, FirewallPortRule{
				Chain:           "prerouting_redirect",
				Managed:         boolPtr(true),
				SourcePort:      *r.dport,
				Protocols:       []string{r.proto},
				DestinationIP:   "0.0.0.0",
				DestinationPort: *r.toPorts,
				Comment:         r.comment,
			})
		default:
			continue
		}
	}
	return out
}

func parsePortForwardsFromSystemPrerouting(rules []iptablesParsedRule) []FirewallPortRule {
	out := make([]FirewallPortRule, 0)
	for _, r := range rules {
		if r.chain != "PREROUTING" {
			continue
		}
		if r.dport == nil || r.proto == "" {
			continue
		}
		switch r.jump {
		case "DNAT":
			dstIP, dstPort := parseToDestination(r.toDest)
			if dstIP == "" || dstPort == 0 {
				continue
			}
			out = append(out, FirewallPortRule{
				Chain:           "prerouting",
				Managed:         boolPtr(false),
				SourcePort:      *r.dport,
				Protocols:       []string{r.proto},
				DestinationIP:   dstIP,
				DestinationPort: dstPort,
				Comment:         r.comment,
			})
		case "REDIRECT":
			if r.toPorts == nil {
				continue
			}
			out = append(out, FirewallPortRule{
				Chain:           "prerouting_redirect",
				Managed:         boolPtr(false),
				SourcePort:      *r.dport,
				Protocols:       []string{r.proto},
				DestinationIP:   "0.0.0.0",
				DestinationPort: *r.toPorts,
				Comment:         r.comment,
			})
		default:
			continue
		}
	}
	return out
}

func parsePortForwardsFromNatOutput(rules []iptablesParsedRule) []FirewallPortRule {
	out := make([]FirewallPortRule, 0)
	for _, r := range rules {
		if r.chain != "OUTPUT" {
			continue
		}
		if r.jump != "REDIRECT" {
			continue
		}
		if r.dport == nil || r.toPorts == nil {
			continue
		}
		if r.proto == "" {
			continue
		}
		if strings.TrimSpace(r.comment) != firewallNatOutputCommentPrefix && !strings.HasPrefix(strings.TrimSpace(r.comment), firewallNatOutputCommentPrefix+":") {
			continue
		}
		comment := parseManagedPortForwardComment(r.comment)
		out = append(out, FirewallPortRule{
			Chain:           "output",
			Managed:         boolPtr(true),
			SourcePort:      *r.dport,
			Protocols:       []string{r.proto},
			DestinationIP:   "0.0.0.0",
			DestinationPort: *r.toPorts,
			Comment:         comment,
		})
	}
	return out
}

func parsePortForwardsFromSystemNatOutput(rules []iptablesParsedRule) []FirewallPortRule {
	out := make([]FirewallPortRule, 0)
	for _, r := range rules {
		if r.chain != "OUTPUT" {
			continue
		}
		if r.jump != "REDIRECT" {
			continue
		}
		if r.dport == nil || r.toPorts == nil {
			continue
		}
		if r.proto == "" {
			continue
		}
		if strings.TrimSpace(r.comment) == firewallNatOutputCommentPrefix || strings.HasPrefix(strings.TrimSpace(r.comment), firewallNatOutputCommentPrefix+":") {
			continue
		}
		out = append(out, FirewallPortRule{
			Chain:           "output",
			Managed:         boolPtr(false),
			SourcePort:      *r.dport,
			Protocols:       []string{r.proto},
			DestinationIP:   "0.0.0.0",
			DestinationPort: *r.toPorts,
			Comment:         r.comment,
		})
	}
	return out
}

func parseManagedPortForwardComment(s string) string {
	t := strings.TrimSpace(s)
	if t == firewallNatOutputCommentPrefix {
		return ""
	}
	if strings.HasPrefix(t, firewallNatOutputCommentPrefix+":") {
		return strings.TrimPrefix(t, firewallNatOutputCommentPrefix+":")
	}
	return ""
}

func parseToDestination(toDest string) (string, int) {
	t := strings.TrimSpace(toDest)
	if t == "" {
		return "", 0
	}
	if strings.Contains(t, ":") {
		parts := strings.Split(t, ":")
		if len(parts) < 2 {
			return "", 0
		}
		portStr := parts[len(parts)-1]
		ip := strings.Join(parts[:len(parts)-1], ":")
		p, err := strconv.Atoi(portStr)
		if err != nil || p < 1 || p > 65535 {
			return "", 0
		}
		return ip, p
	}
	return "", 0
}

func filterAutoForwardRules(forward []iptablesParsedRule, portForwards []FirewallPortRule) []iptablesParsedRule {
	if len(portForwards) == 0 || len(forward) == 0 {
		return forward
	}
	keys := make(map[string]struct{}, len(portForwards))
	for _, pf := range portForwards {
		for _, p := range pf.Protocols {
			switch strings.ToLower(strings.TrimSpace(pf.Chain)) {
			case "output", "prerouting_redirect":
				continue
			}
			if isLocalRedirectDestination(pf.DestinationIP) {
				continue
			}
			keys[fmt.Sprintf("%s|%d|%s|%s", pf.DestinationIP, pf.DestinationPort, strings.ToLower(p), pf.Comment)] = struct{}{}
		}
	}

	out := make([]iptablesParsedRule, 0, len(forward))
	for _, r := range forward {
		if r.jump == "ACCEPT" && strings.Contains(r.ctstate, "NEW,ESTABLISHED,RELATED") && r.dstIP != "" && r.dport != nil && r.proto != "" {
			if _, ok := keys[fmt.Sprintf("%s|%d|%s|%s", r.dstIP, *r.dport, strings.ToLower(r.proto), r.comment)]; ok {
				continue
			}
		}
		out = append(out, r)
	}
	return out
}

func parseCommRulesFromChain(chain string, rules []iptablesParsedRule) []FirewallRule {
	out := make([]FirewallRule, 0)
	for _, r := range rules {
		if isInternalAcceptRule(chain, r) {
			continue
		}

		action := strings.ToLower(r.jump)
		if action != "accept" && action != "drop" && action != "reject" {
			continue
		}
		protos := []string{"any"}
		if r.proto != "" {
			protos = []string{r.proto}
		}

		src := r.srcIP
		dst := r.dstIP
		if src == "0.0.0.0/0" {
			src = ""
		}
		if dst == "0.0.0.0/0" {
			dst = ""
		}

		out = append(out, FirewallRule{
			Chain:           chain,
			SourceIP:        src,
			SourcePort:      r.sport,
			Protocols:       protos,
			DestinationIP:   dst,
			DestinationPort: r.dport,
			Action:          action,
			Comment:         r.comment,
		})
	}
	return out
}

func isInternalAcceptRule(chain string, r iptablesParsedRule) bool {
	if r.jump != "ACCEPT" {
		return false
	}
	if chain == "input" && r.inIface == "lo" {
		return true
	}
	if chain == "output" && r.outIface == "lo" {
		return true
	}
	if strings.Contains(r.ctstate, "ESTABLISHED,RELATED") {
		return true
	}
	return false
}

func groupFirewallRules(in []FirewallRule) []FirewallRule {
	type key struct {
		chain string
		src   string
		dst   string
		sport string
		dport string
		act   string
		cmt   string
	}

	out := make([]FirewallRule, 0)
	index := make(map[key]int)
	for _, r := range in {
		k := key{
			chain: r.Chain,
			src:   r.SourceIP,
			dst:   r.DestinationIP,
			act:   r.Action,
			cmt:   r.Comment,
		}
		if r.SourcePort != nil {
			k.sport = strconv.Itoa(*r.SourcePort)
		}
		if r.DestinationPort != nil {
			k.dport = strconv.Itoa(*r.DestinationPort)
		}

		if idx, ok := index[k]; ok {
			if len(out[idx].Protocols) == 1 && out[idx].Protocols[0] == "any" {
				continue
			}
			if len(r.Protocols) == 1 && r.Protocols[0] == "any" {
				out[idx].Protocols = []string{"any"}
				continue
			}
			out[idx].Protocols = appendUnique(out[idx].Protocols, r.Protocols...)
			continue
		}

		index[k] = len(out)
		out = append(out, r)
	}
	return out
}

func groupPortForwards(in []FirewallPortRule) []FirewallPortRule {
	type key struct {
		chain   string
		managed string
		srcPort int
		dstIP   string
		dstPort int
		cmt     string
	}

	out := make([]FirewallPortRule, 0)
	index := make(map[key]int)
	for _, r := range in {
		managed := "true"
		if r.Managed != nil && !*r.Managed {
			managed = "false"
		}
		k := key{
			chain:   r.Chain,
			managed: managed,
			srcPort: r.SourcePort,
			dstIP:   r.DestinationIP,
			dstPort: r.DestinationPort,
			cmt:     r.Comment,
		}
		if idx, ok := index[k]; ok {
			out[idx].Protocols = appendUnique(out[idx].Protocols, r.Protocols...)
			continue
		}
		index[k] = len(out)
		out = append(out, r)
	}
	return out
}

func appendUnique(dst []string, items ...string) []string {
	set := make(map[string]struct{}, len(dst))
	for _, v := range dst {
		set[v] = struct{}{}
	}
	for _, v := range items {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" {
			continue
		}
		if _, ok := set[v]; ok {
			continue
		}
		set[v] = struct{}{}
		dst = append(dst, v)
	}
	return dst
}

func resetFirewallForFactory() {
	if _, err := exec.LookPath("iptables"); err != nil {
		return
	}

	_ = removeFirewallJumps(false)
	_ = removeFirewallChains(false)

	natSupported, err := iptablesTableSupported("nat")
	if err == nil && natSupported {
		_ = removeFirewallJumps(true)
		_ = removeFirewallChains(true)
	}

	_ = sysctlWrite("net.ipv4.ip_forward", "0")
}

func removeFirewallJumps(needNat bool) error {
	if err := removeJumpAll("filter", "INPUT", firewallChainInput); err != nil {
		return err
	}
	if err := removeJumpAll("filter", "OUTPUT", firewallChainOutput); err != nil {
		return err
	}
	if err := removeJumpAll("filter", "FORWARD", firewallChainForward); err != nil {
		return err
	}
	if needNat {
		if err := removeJumpAll("nat", "PREROUTING", firewallChainNatPrerouting); err != nil {
			return err
		}
		if err := removeJumpAll("nat", "POSTROUTING", firewallChainNatPostrouting); err != nil {
			return err
		}
	}
	return nil
}

func removeJumpAll(table, fromChain, toChain string) error {
	for i := 0; i < 16; i++ {
		err := iptables(table, "-D", fromChain, "-j", toChain)
		if err == nil {
			continue
		}
		if isNoSuchRuleErr(err) {
			return nil
		}
		return err
	}
	return nil
}

func removeFirewallChains(needNat bool) error {
	for _, chain := range []string{firewallChainInput, firewallChainOutput, firewallChainForward} {
		_ = iptables("filter", "-F", chain)
		_ = iptables("filter", "-X", chain)
	}
	if needNat {
		for _, chain := range []string{firewallChainNatPrerouting, firewallChainNatPostrouting} {
			_ = iptables("nat", "-F", chain)
			_ = iptables("nat", "-X", chain)
		}
	}
	return nil
}

func isNoSuchRuleErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if strings.Contains(msg, "No chain/target/match by that name") {
		return true
	}
	if strings.Contains(msg, "Bad rule") {
		return true
	}
	if strings.Contains(msg, "does a matching rule exist in that chain") {
		return true
	}
	if strings.Contains(msg, "No such file or directory") {
		return true
	}
	return errors.Is(err, exec.ErrNotFound)
}
