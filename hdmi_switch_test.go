package kvm

import "testing"

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
