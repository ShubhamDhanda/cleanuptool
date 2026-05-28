package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Config struct {
	Root              string
	DryRun            bool
	AssumeYes         bool
	All               bool
	NodeModules       bool
	GoCaches          bool
	Docker            bool
	Temp              bool
	IncludeUserCaches bool
	OlderThanDays     int
	MaxDepth          int
	Verbose           bool
}

func main() {
	cfg := parseFlags()

	if cfg.All || noTargetsSelected(cfg) {
		cfg.NodeModules = true
		cfg.GoCaches = true
		cfg.Docker = true
		cfg.Temp = true
	}

	root, err := filepath.Abs(cfg.Root)
	if err != nil {
		exitErr(fmt.Errorf("resolve root: %w", err))
	}
	cfg.Root = root

	ui := NewUI()
	ui.Title("cleanuptool")
	ui.Line("Root: " + cfg.Root)
	if cfg.DryRun {
		ui.Info("Dry run is enabled. Nothing will be deleted.")
	}

	var candidates []Candidate

	if cfg.NodeModules {
		found, err := withSpinnerResult(ui, "Scanning node_modules directories", func() ([]Candidate, error) {
			return findNodeModules(cfg.Root, cfg.MaxDepth)
		})
		if err != nil {
			ui.Warn("node_modules scan finished with errors: " + compactError(err))
		}
		candidates = append(candidates, found...)
		ui.Found("node_modules", len(found), totalKnownSize(found))
	}

	if cfg.GoCaches {
		found, err := withSpinnerResult(ui, "Checking Go caches", scanGoCaches)
		if err != nil {
			ui.Warn("Go cache check skipped: " + compactError(err))
		}
		candidates = append(candidates, found...)
		ui.Found("Go caches", len(found), totalKnownSize(found))
	}

	if cfg.Docker {
		found, err := withSpinnerResult(ui, "Checking Docker cleanup", scanDocker)
		if err != nil {
			ui.Warn("Docker cleanup skipped: " + compactError(err))
		}
		candidates = append(candidates, found...)
		ui.Found("Docker cleanup targets", len(found), totalKnownSize(found))
	}

	if cfg.Temp {
		cutoff := time.Now().AddDate(0, 0, -cfg.OlderThanDays)
		found, err := withSpinnerResult(ui, "Scanning temp directories", func() ([]Candidate, error) {
			return findTempEntries(cutoff, cfg.IncludeUserCaches)
		})
		if err != nil {
			ui.Warn("temp scan finished with errors: " + compactError(err))
		}
		candidates = append(candidates, found...)
		ui.Found("temp entries", len(found), totalKnownSize(found))
	}

	if len(candidates) == 0 {
		ui.Success("Nothing to clean.")
		return
	}

	groups := groupCandidates(candidates)
	printPlan(ui, groups, cfg.Verbose)

	if cfg.DryRun {
		ui.Success("Dry run complete. Run without --dry-run and choose targets with Space + Enter.")
		return
	}

	selected := candidates
	if !cfg.AssumeYes {
		chosen, err := selectGroups(ui, groups)
		if err != nil {
			exitErr(err)
		}
		if len(chosen) == 0 {
			ui.Warn("Cleanup cancelled.")
			return
		}
		selected = chosen
		printPlan(ui, groupCandidates(selected), cfg.Verbose)
	}

	var cleaned int
	var reclaimed int64
	var failures []error

	for _, candidate := range selected {
		c := candidate
		err := withSpinner(ui, "Cleaning "+c.Label, func() error {
			return c.Clean()
		})
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", c.Label, err))
			ui.Warn(c.Label + " failed: " + err.Error())
			continue
		}
		cleaned++
		if c.Size >= 0 {
			reclaimed += c.Size
		}
		if cfg.Verbose && c.Path != "" {
			ui.Line("  removed " + c.Path)
		}
	}

	if len(failures) > 0 {
		ui.Warn(fmt.Sprintf("Finished with %d failure(s).", len(failures)))
		for _, failure := range failures {
			ui.Line("  - " + failure.Error())
		}
	}

	ui.Success(fmt.Sprintf("Cleaned %d item(s). Estimated reclaimed space: %s.", cleaned, humanBytes(reclaimed)))
}

func parseFlags() Config {
	cfg := Config{}
	flag.StringVar(&cfg.Root, "root", ".", "workspace root to scan recursively for node_modules")
	flag.BoolVar(&cfg.DryRun, "dry-run", false, "preview cleanup without deleting anything")
	flag.BoolVar(&cfg.AssumeYes, "yes", false, "skip confirmation prompts and delete selected items")
	flag.BoolVar(&cfg.AssumeYes, "y", false, "shorthand for --yes")
	flag.BoolVar(&cfg.All, "all", false, "enable all cleanup targets")
	flag.BoolVar(&cfg.NodeModules, "node-modules", false, "recursively delete every node_modules directory under --root")
	flag.BoolVar(&cfg.GoCaches, "go-caches", false, "clean Go module, build, and test caches")
	flag.BoolVar(&cfg.Docker, "docker", false, "prune unused Docker images and stopped containers")
	flag.BoolVar(&cfg.Temp, "temp", false, "delete old entries from OS temp directories")
	flag.BoolVar(&cfg.IncludeUserCaches, "include-user-caches", false, "also scan user cache folders such as ~/Library/Caches or ~/.cache")
	flag.IntVar(&cfg.OlderThanDays, "older-than", 7, "only delete temp entries older than this many days")
	flag.IntVar(&cfg.MaxDepth, "max-depth", 0, "max directory depth for node_modules scan; 0 means fully recursive")
	flag.BoolVar(&cfg.Verbose, "verbose", false, "print every removed path")
	flag.Usage = usage
	flag.Parse()

	if cfg.OlderThanDays < 0 {
		exitErr(errors.New("--older-than cannot be negative"))
	}
	if cfg.MaxDepth < 0 {
		exitErr(errors.New("--max-depth cannot be negative"))
	}

	return cfg
}

func usage() {
	fmt.Fprintf(flag.CommandLine.Output(), `cleanuptool

A cross-platform disk cleanup CLI for development machines.

Usage:
  cleanuptool
  cleanuptool --dry-run --all --root /Users/Github
  cleanuptool --all --yes --root /Users/Github
  cleanuptool --node-modules --temp --older-than 14

Flags:
`)
	flag.PrintDefaults()
	fmt.Fprintf(flag.CommandLine.Output(), `
Targets default to --all when no specific target flag is provided.
Interactive mode lets you choose targets with Space and run them with Enter.
node_modules cleanup is recursive by default and scans all directories below --root.
Go cleanup removes Go module/build/test caches, not project go.mod files.
On %s, temp cleanup uses OS temp directories and leaves entries newer than --older-than untouched.
`, runtime.GOOS)
}

func noTargetsSelected(cfg Config) bool {
	return !cfg.NodeModules && !cfg.GoCaches && !cfg.Docker && !cfg.Temp
}

func exitErr(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func compactError(err error) string {
	lines := strings.Split(err.Error(), "\n")
	var kept []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			kept = append(kept, line)
		}
	}
	if len(kept) <= 3 {
		return strings.Join(kept, "; ")
	}
	return strings.Join(kept[:3], "; ") + fmt.Sprintf(" (%d more)", len(kept)-3)
}
