package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Candidate struct {
	Kind  string
	Label string
	Path  string
	Size  int64
	Clean func() error
}

func findNodeModules(root string, maxDepth int) ([]Candidate, error) {
	var candidates []Candidate
	var errs []error
	rootDepth := pathDepth(root)

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			errs = append(errs, walkErr)
			return nil
		}
		if !entry.IsDir() {
			return nil
		}

		name := entry.Name()
		if name == ".git" {
			return filepath.SkipDir
		}

		if maxDepth > 0 && pathDepth(path)-rootDepth > maxDepth {
			return filepath.SkipDir
		}

		if name != "node_modules" {
			return nil
		}

		size, sizeErr := dirSize(path)
		if sizeErr != nil {
			errs = append(errs, sizeErr)
		}

		p := path
		candidates = append(candidates, Candidate{
			Kind:  "node_modules",
			Label: shortPath(p),
			Path:  p,
			Size:  size,
			Clean: func() error {
				return os.RemoveAll(p)
			},
		})

		return filepath.SkipDir
	})

	if err != nil {
		errs = append(errs, err)
	}

	return candidates, joinErrors(errs)
}

func scanGoCaches() ([]Candidate, error) {
	if _, err := exec.LookPath("go"); err != nil {
		return nil, errors.New("go binary not found")
	}

	modCache := strings.TrimSpace(commandOutput("go", "env", "GOMODCACHE"))
	buildCache := strings.TrimSpace(commandOutput("go", "env", "GOCACHE"))

	var size int64
	var paths []string
	for _, path := range []string{modCache, buildCache} {
		if path == "" {
			continue
		}
		paths = append(paths, path)
		if existingDir(path) {
			if s, err := dirSize(path); err == nil {
				size += s
			}
		}
	}

	return []Candidate{{
		Kind:  "go_caches",
		Label: "Go module/build/test caches",
		Path:  strings.Join(paths, ", "),
		Size:  size,
		Clean: func() error {
			cmd := exec.Command("go", "clean", "-modcache", "-cache", "-testcache")
			out, err := cmd.CombinedOutput()
			if err != nil {
				return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
			}
			return nil
		},
	}}, nil
}

func scanDocker() ([]Candidate, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return nil, errors.New("docker binary not found")
	}

	usage := dockerUsage()

	return []Candidate{
		{
			Kind:  "docker_images",
			Label: "Docker unused images",
			Path:  "docker image prune -af",
			Size:  usage["Images"],
			Clean: func() error {
				cmd := exec.Command("docker", "image", "prune", "-af")
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
				}
				return nil
			},
		},
		{
			Kind:  "docker_containers",
			Label: "Docker stopped containers",
			Path:  "docker container prune -f",
			Size:  usage["Containers"],
			Clean: func() error {
				cmd := exec.Command("docker", "container", "prune", "-f")
				out, err := cmd.CombinedOutput()
				if err != nil {
					return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
				}
				return nil
			},
		},
	}, nil
}

func findTempEntries(cutoff time.Time, includeUserCaches bool) ([]Candidate, error) {
	var candidates []Candidate
	var errs []error

	for _, root := range tempRoots(includeUserCaches) {
		entries, err := os.ReadDir(root)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", root, err))
			continue
		}

		for _, entry := range entries {
			path := filepath.Join(root, entry.Name())
			info, err := entry.Info()
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", path, err))
				continue
			}
			if info.ModTime().After(cutoff) {
				continue
			}

			size := info.Size()
			if entry.IsDir() {
				if s, err := dirSize(path); err == nil {
					size = s
				} else {
					errs = append(errs, err)
				}
			}

			p := path
			candidates = append(candidates, Candidate{
				Kind:  "temp",
				Label: shortPath(p),
				Path:  p,
				Size:  size,
				Clean: func() error {
					return os.RemoveAll(p)
				},
			})
		}
	}

	return candidates, joinErrors(errs)
}

func tempRoots(includeUserCaches bool) []string {
	var roots []string
	add := func(path string) {
		if path == "" {
			return
		}
		clean := filepath.Clean(path)
		if existingDir(clean) {
			roots = append(roots, clean)
		}
	}

	add(os.TempDir())

	switch runtime.GOOS {
	case "darwin":
		add("/tmp")
		add("/var/tmp")
		if includeUserCaches {
			if home, err := os.UserHomeDir(); err == nil {
				add(filepath.Join(home, "Library", "Caches"))
			}
		}
	case "linux":
		add("/tmp")
		add("/var/tmp")
		if includeUserCaches {
			if home, err := os.UserHomeDir(); err == nil {
				add(filepath.Join(home, ".cache"))
			}
		}
	case "windows":
		add(os.Getenv("TEMP"))
		add(os.Getenv("TMP"))
		if windir := os.Getenv("SystemRoot"); windir != "" {
			add(filepath.Join(windir, "Temp"))
		}
		if includeUserCaches {
			if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
				add(filepath.Join(localAppData, "Temp"))
			}
		}
	}

	return dedupeStrings(roots)
}

func dirSize(root string) (int64, error) {
	var size int64
	var errs []error

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			errs = append(errs, walkErr)
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", path, err))
			return nil
		}
		size += info.Size()
		return nil
	})
	if err != nil {
		errs = append(errs, err)
	}

	return size, joinErrors(errs)
}

func commandOutput(name string, args ...string) string {
	out, err := exec.Command(name, args...).Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func commandOutputErr(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return string(out), err
}

func dockerUsage() map[string]int64 {
	usage := map[string]int64{
		"Images":     -1,
		"Containers": -1,
	}

	out, err := commandOutputErr("docker", "system", "df", "--format", "{{.Type}}\t{{.Reclaimable}}")
	if err != nil {
		return usage
	}

	for _, line := range strings.Split(out, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) != 2 {
			continue
		}
		size, ok := parseDockerSize(fields[1])
		if !ok {
			continue
		}
		usage[strings.TrimSpace(fields[0])] = size
	}

	return usage
}

func parseDockerSize(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if idx := strings.Index(value, " "); idx >= 0 {
		value = value[:idx]
	}
	if idx := strings.Index(value, "("); idx >= 0 {
		value = value[:idx]
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}

	i := 0
	for i < len(value) && ((value[i] >= '0' && value[i] <= '9') || value[i] == '.') {
		i++
	}
	if i == 0 || i == len(value) {
		return 0, false
	}

	number, err := strconv.ParseFloat(value[:i], 64)
	if err != nil {
		return 0, false
	}

	unit := strings.ToUpper(strings.TrimSpace(value[i:]))
	multipliers := map[string]float64{
		"B":   1,
		"KB":  1000,
		"MB":  1000 * 1000,
		"GB":  1000 * 1000 * 1000,
		"TB":  1000 * 1000 * 1000 * 1000,
		"KIB": 1024,
		"MIB": 1024 * 1024,
		"GIB": 1024 * 1024 * 1024,
		"TIB": 1024 * 1024 * 1024 * 1024,
	}
	multiplier, ok := multipliers[unit]
	if !ok {
		return 0, false
	}

	return int64(number * multiplier), true
}

func existingDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func totalKnownSize(candidates []Candidate) int64 {
	var total int64
	for _, candidate := range candidates {
		if candidate.Size >= 0 {
			total += candidate.Size
		}
	}
	return total
}

func shortPath(path string) string {
	if home, err := os.UserHomeDir(); err == nil {
		if rel, err := filepath.Rel(home, path); err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
			return "~" + string(filepath.Separator) + rel
		}
	}
	return path
}

func pathDepth(path string) int {
	clean := filepath.Clean(path)
	if clean == string(filepath.Separator) || clean == "." {
		return 0
	}
	return len(strings.Split(clean, string(filepath.Separator)))
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func joinErrors(errs []error) error {
	var filtered []error
	for _, err := range errs {
		if err != nil {
			filtered = append(filtered, err)
		}
	}
	return errors.Join(filtered...)
}
