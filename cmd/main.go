package main

import (
	"os"

	"kvm"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "cli" {
		kvm.RunCLI(os.Args[2:])
		return
	}
	kvm.Main()
}
