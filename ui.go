package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type UI struct {
	color bool
}

type Spinner struct {
	ui      *UI
	message string
	done    chan struct{}
	once    sync.Once
}

func NewUI() *UI {
	return &UI{
		color: isTerminal(os.Stdout) && os.Getenv("NO_COLOR") == "",
	}
}

func (ui *UI) Title(text string) {
	ui.Line("")
	ui.Line(ui.paint(bold, text))
	ui.Line(strings.Repeat("=", len(text)))
}

func (ui *UI) Line(text string) {
	fmt.Fprintln(os.Stdout, text)
}

func (ui *UI) Info(text string) {
	ui.Line(ui.paint(cyan, "info: ") + truncate(text, terminalWidth()-6))
}

func (ui *UI) Warn(text string) {
	ui.Line(ui.paint(yellow, "warn: ") + truncate(text, terminalWidth()-6))
}

func (ui *UI) Success(text string) {
	ui.Line(ui.paint(green, "done: ") + truncate(text, terminalWidth()-6))
}

func (ui *UI) Found(label string, count int, size int64) {
	if count == 0 {
		ui.Line(ui.paint(dim, "none: ") + label)
		return
	}
	ui.Line(fmt.Sprintf("%s %s (%s)", ui.paint(green, "found:"), plural(count, label), humanBytes(size)))
}

func (ui *UI) paint(code string, text string) string {
	if !ui.color {
		return text
	}
	return code + text + reset
}

func (ui *UI) StartSpinner(message string) *Spinner {
	spinner := &Spinner{
		ui:      ui,
		message: message,
		done:    make(chan struct{}),
	}

	if !ui.color {
		ui.Line(message + "...")
		return spinner
	}

	go func() {
		frames := []string{"|", "/", "-", "\\"}
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		i := 0
		for {
			select {
			case <-spinner.done:
				fmt.Fprint(os.Stdout, "\r\033[K")
				return
			case <-ticker.C:
				fmt.Fprintf(os.Stdout, "\r%s %s", ui.paint(cyan, frames[i%len(frames)]), message)
				i++
			}
		}
	}()

	return spinner
}

func (spinner *Spinner) Stop() {
	spinner.once.Do(func() {
		close(spinner.done)
		if spinner.ui.color {
			time.Sleep(10 * time.Millisecond)
		}
	})
}

func withSpinner(ui *UI, message string, fn func() error) error {
	spinner := ui.StartSpinner(message)
	err := fn()
	spinner.Stop()
	return err
}

func withSpinnerResult[T any](ui *UI, message string, fn func() (T, error)) (T, error) {
	var zero T
	spinner := ui.StartSpinner(message)
	result, err := fn()
	spinner.Stop()
	if err != nil {
		return result, err
	}
	if any(result) == nil {
		return zero, nil
	}
	return result, nil
}

func printSummary(ui *UI, candidates []Candidate) {
	ui.Line("")
	ui.Line(ui.paint(bold, "Cleanup summary"))

	width := 18
	for _, candidate := range candidates {
		if len(candidate.Kind) > width {
			width = len(candidate.Kind)
		}
	}

	for _, candidate := range candidates {
		size := "unknown"
		if candidate.Size >= 0 {
			size = humanBytes(candidate.Size)
		}
		fmt.Fprintf(os.Stdout, "  %-*s  %10s  %s\n", width, candidate.Kind, size, candidate.Label)
	}

	ui.Line(fmt.Sprintf("\nEstimated reclaimable space: %s", humanBytes(totalKnownSize(candidates))))
}

func terminalWidth() int {
	if cols := strings.TrimSpace(os.Getenv("COLUMNS")); cols != "" {
		if width, err := strconv.Atoi(cols); err == nil && width >= 60 {
			return width
		}
	}

	if isTerminal(os.Stdout) {
		cmd := exec.Command("stty", "size")
		cmd.Stdin = os.Stdin
		if out, err := cmd.Output(); err == nil {
			parts := strings.Fields(string(out))
			if len(parts) == 2 {
				if width, err := strconv.Atoi(parts[1]); err == nil && width >= 60 {
					return width
				}
			}
		}
	}

	return 100
}

func truncate(text string, width int) string {
	if width <= 0 {
		return ""
	}
	if len(text) <= width {
		return text
	}
	if width <= 3 {
		return text[:width]
	}
	return text[:width-3] + "..."
}

func padOrTruncate(text string, width int) string {
	text = truncate(text, width)
	if len(text) >= width {
		return text
	}
	return text + strings.Repeat(" ", width-len(text))
}

func humanBytes(size int64) string {
	if size < 0 {
		return "unknown"
	}
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(size)/float64(div), "KMGTPE"[exp])
}

func plural(count int, label string) string {
	if count == 1 {
		return fmt.Sprintf("1 %s", strings.TrimSuffix(label, "s"))
	}
	return fmt.Sprintf("%d %s", count, label)
}

func isTerminal(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && (info.Mode()&os.ModeCharDevice) != 0
}

const (
	reset  = "\033[0m"
	bold   = "\033[1m"
	dim    = "\033[2m"
	green  = "\033[32m"
	yellow = "\033[33m"
	cyan   = "\033[36m"
)
