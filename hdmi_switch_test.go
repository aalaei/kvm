package kvm

import (
	"encoding/json"
	"testing"
)

func TestNormalizeHDMISwitchURL(t *testing.T) {
	cases := map[string]string{
		"":                          "",
		"esp-hdmi-mux.local":        "http://esp-hdmi-mux.local",
		" 192.0.2.10 ":              "http://192.0.2.10",
		"192.0.2.10:8080/":          "http://192.0.2.10:8080",
		"https://switch.lan/":       "https://switch.lan",
		"http://esp-hdmi-mux.local": "http://esp-hdmi-mux.local",
	}
	for in, want := range cases {
		if got := normalizeHDMISwitchURL(in); got != want {
			t.Errorf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := validateHDMISwitchURL("ftp://x"); err == nil {
		t.Error("ftp scheme should be rejected")
	}
}

func TestNormalizeESPHomeID(t *testing.T) {
	cases := map[string]string{
		"select/HDMI select":      "select-hdmi_select",
		"select-hdmi_select":      "select-hdmi_select",
		"text_sensor/HDMI 3 Name": "text_sensor-hdmi_3_name",
		"text_sensor-hdmi_3_name": "text_sensor-hdmi_3_name",
	}
	for in, want := range cases {
		if got := normalizeESPHomeID(in); got != want {
			t.Errorf("normalizeESPHomeID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestApplyHDMISwitchSSEState(t *testing.T) {
	hdmiSwitchState = &HDMISwitchState{PortNames: make([]string, 5)}
	for _, raw := range []string{
		`{"id":"select/HDMI select","value":"HDMI3","state":"HDMI3"}`,
		`{"id":"text_sensor/HDMI 2 Name","value":"TV","state":"TV"}`,
		`{"id":"switch/Sync USB","value":true,"state":"ON"}`,
	} {
		var p sseStatePayload
		if err := json.Unmarshal([]byte(raw), &p); err != nil {
			t.Fatalf("unmarshal %s: %v", raw, err)
		}
		applyHDMISwitchSSEState(p)
	}
	if hdmiSwitchState.CurrentPort != 3 || hdmiSwitchState.PortNames[1] != "TV" {
		t.Errorf("port/name not applied: %+v", hdmiSwitchState)
	}
	if hdmiSwitchState.SyncUSB == nil || !*hdmiSwitchState.SyncUSB {
		t.Errorf("sync usb not applied: %v", hdmiSwitchState.SyncUSB)
	}
}
