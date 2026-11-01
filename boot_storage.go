package kvm

import (
	"os"
	"strings"
	"sync"
)

type BootStorageType string

const (
	BootStorageUnknown BootStorageType = "unknown"
	BootStorageEMMC    BootStorageType = "emmc"
	BootStorageSD      BootStorageType = "sd"
)

var (
	bootStorageOnce sync.Once
	bootStorageType BootStorageType = BootStorageUnknown
)

func GetBootStorageType() BootStorageType {
	bootStorageOnce.Do(func() {
		bootStorageType = detectBootStorageType()
	})
	return bootStorageType
}

func IsBootFromSD() bool {
	return GetBootStorageType() == BootStorageSD
}

func detectBootStorageType() BootStorageType {
	cmdlineBytes, err := os.ReadFile("/proc/cmdline")
	if err != nil {
		return BootStorageUnknown
	}

	cmdline := strings.TrimSpace(string(cmdlineBytes))
	for _, field := range strings.Fields(cmdline) {
		if !strings.HasPrefix(field, "root=") {
			continue
		}
		root := strings.TrimPrefix(field, "root=")
		switch {
		case strings.HasPrefix(root, "/dev/mmcblk0"):
			return BootStorageEMMC
		case strings.HasPrefix(root, "/dev/mmcblk1"):
			return BootStorageSD
		default:
			return BootStorageUnknown
		}
	}

	return BootStorageUnknown
}

