//go:build !linux

package kvm

import "os/exec"

func bindChildToParent(cmd *exec.Cmd) {}

func killStaleProcesses(name string, exclude int) int { return 0 }
