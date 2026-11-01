package kvm

import (
	"kvm/internal/mdns"
)

var mDNS *mdns.MDNS

func initMdns() error {
	m, err := mdns.NewMDNS(&mdns.MDNSOptions{
		Logger: logger,
		LocalNames: []string{
			networkState.GetHostname(),
		},
		Services: []mdns.Service{
			{Type: "_http._tcp", Port: 80, TXT: []string{"path=/"}},
		},
		ListenOptions: &mdns.MDNSListenOptions{
			IPv4: true,
			IPv6: true,
		},
	})
	if err != nil {
		return err
	}

	mDNS = m

	// Start immediately with current network names; networkStateChanged() will
	// call SetLocalNames/SetListenOptions again when the interface state updates.
	if err := m.Start(); err != nil {
		logger.Warn().Err(err).Msg("failed to start mDNS server on init")
	}

	return nil
}
