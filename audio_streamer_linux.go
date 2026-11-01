//go:build linux

package kvm

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// bindChildToParent makes the kernel SIGKILL the child when kvm_app exits, so
// a streamer can never outlive the app and keep the ALSA capture device busy.
func bindChildToParent(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Pdeathsig = syscall.SIGKILL
}

// killStaleProcesses kills processes whose executable basename is name and
// that are not children we track (exclude). Returns how many were killed.
// It catches streamers left behind by a previous kvm_app (e.g. older builds
// without Pdeathsig), which otherwise hold hw:0,0 and make new ones fail.
func killStaleProcesses(name string, exclude int) int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return 0
	}
	self := os.Getpid()
	killed := 0
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid == self || pid == exclude {
			continue
		}
		cmdline, err := os.ReadFile(filepath.Join("/proc", e.Name(), "cmdline"))
		if err != nil || len(cmdline) == 0 {
			continue
		}
		argv0 := strings.SplitN(string(cmdline), "\x00", 2)[0]
		if filepath.Base(argv0) != name {
			continue
		}
		if syscall.Kill(pid, syscall.SIGKILL) == nil {
			killed++
		}
	}
	return killed
}
