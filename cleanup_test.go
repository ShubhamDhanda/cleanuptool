package main

import "testing"

func TestHumanBytes(t *testing.T) {
	tests := map[int64]string{
		0:          "0 B",
		512:        "512 B",
		1024:       "1.0 KiB",
		1024 * 512: "512.0 KiB",
	}

	for input, want := range tests {
		if got := humanBytes(input); got != want {
			t.Fatalf("humanBytes(%d) = %q, want %q", input, got, want)
		}
	}
}

func TestDedupeStrings(t *testing.T) {
	got := dedupeStrings([]string{"a", "b", "a", "c", "b"})
	want := []string{"a", "b", "c"}

	if len(got) != len(want) {
		t.Fatalf("dedupe length = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("dedupe[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestParseDockerSize(t *testing.T) {
	tests := map[string]int64{
		"0B (0%)":      0,
		"12.5MB (25%)": 12_500_000,
		"1.5GB (100%)": 1_500_000_000,
		"2MiB (10%)":   2 * 1024 * 1024,
	}

	for input, want := range tests {
		got, ok := parseDockerSize(input)
		if !ok {
			t.Fatalf("parseDockerSize(%q) was not ok", input)
		}
		if got != want {
			t.Fatalf("parseDockerSize(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestGroupSizeUnknownWhenNoKnownCandidates(t *testing.T) {
	got := groupSize([]Candidate{{Size: -1}, {Size: -1}})
	if got != -1 {
		t.Fatalf("groupSize unknown = %d, want -1", got)
	}
}
