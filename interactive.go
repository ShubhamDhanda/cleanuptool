package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

func selectGroups(ui *UI, groups []CleanupGroup) ([]Candidate, error) {
	if !isTerminal(os.Stdin) {
		return nil, errors.New("interactive selection needs a terminal; pass --yes for unattended cleanup")
	}

	if runtime.GOOS == "windows" {
		return selectGroupsByNumber(ui, groups)
	}

	restore, err := startRawMode()
	if err != nil {
		ui.Warn("rich selection unavailable, falling back to numbered input: " + err.Error())
		return selectGroupsByNumber(ui, groups)
	}
	defer restore()

	selected := make([]bool, len(groups))
	cursor := 0
	message := ""

	for {
		renderSelector(ui, groups, selected, cursor, message)
		key, err := readKey()
		if err != nil {
			return nil, err
		}

		message = ""
		switch key {
		case "up", "k":
			if cursor > 0 {
				cursor--
			}
		case "down", "j":
			if cursor < len(groups)-1 {
				cursor++
			}
		case "space":
			selected[cursor] = !selected[cursor]
		case "a":
			allSelected := true
			for _, value := range selected {
				if !value {
					allSelected = false
					break
				}
			}
			for i := range selected {
				selected[i] = !allSelected
			}
		case "enter":
			chosen := selectedCandidates(groups, selected)
			fmt.Fprint(os.Stdout, "\033[2J\033[H\033[?25h")
			if len(chosen) == 0 {
				return nil, nil
			}
			return chosen, nil
		case "q", "ctrl-c":
			fmt.Fprint(os.Stdout, "\033[2J\033[H\033[?25h")
			return nil, nil
		default:
			message = "Use Space to select, Enter to clean, q to cancel."
		}
	}
}

func renderSelector(ui *UI, groups []CleanupGroup, selected []bool, cursor int, message string) {
	width := terminalWidth()
	fmt.Fprint(os.Stdout, "\033[2J\033[H\033[?25l")
	ui.Line(ui.paint(bold, "Choose cleanup targets"))
	ui.Line(truncate("Space toggles, Enter runs selected, a toggles all, q cancels.", width))
	ui.Line("")

	targetWidth := 18
	sizeWidth := 10
	detailWidth := width - 2 - 3 - 1 - targetWidth - 1 - sizeWidth - 2
	if detailWidth < 14 {
		targetWidth = 16
		detailWidth = width - 2 - 3 - 1 - targetWidth - 1 - sizeWidth - 2
	}
	if detailWidth < 8 {
		detailWidth = 8
	}

	for i, group := range groups {
		pointer := " "
		if i == cursor {
			pointer = ">"
		}
		box := "[ ]"
		if selected[i] {
			box = "[x]"
		}
		line := fmt.Sprintf(
			"%s %s %s %*s  %s",
			pointer,
			box,
			padOrTruncate(group.Title, targetWidth),
			sizeWidth,
			truncate(humanBytes(group.Size), sizeWidth),
			truncate(group.Detail, detailWidth),
		)
		if i == cursor {
			line = ui.paint(cyan, line)
		}
		ui.Line(line)
	}

	selectedSize := totalKnownSize(selectedCandidates(groups, selected))
	ui.Line("")
	ui.Line("Selected reclaimable space: " + humanBytes(selectedSize))
	if message != "" {
		ui.Warn(message)
	}
}

func readKey() (string, error) {
	var b [1]byte
	if _, err := os.Stdin.Read(b[:]); err != nil {
		return "", err
	}

	switch b[0] {
	case 3:
		return "ctrl-c", nil
	case 13, 10:
		return "enter", nil
	case 32:
		return "space", nil
	case 'a', 'A':
		return "a", nil
	case 'j', 'J':
		return "j", nil
	case 'k', 'K':
		return "k", nil
	case 'q', 'Q':
		return "q", nil
	case 27:
		var seq [2]byte
		if _, err := os.Stdin.Read(seq[:]); err != nil {
			return "", err
		}
		if seq[0] == '[' {
			switch seq[1] {
			case 'A':
				return "up", nil
			case 'B':
				return "down", nil
			}
		}
	}

	return "", nil
}

func startRawMode() (func(), error) {
	current := exec.Command("stty", "-g")
	current.Stdin = os.Stdin
	out, err := current.Output()
	if err != nil {
		return nil, err
	}
	state := strings.TrimSpace(string(out))

	cbreak := exec.Command("stty", "cbreak", "-echo")
	cbreak.Stdin = os.Stdin
	if err := cbreak.Run(); err != nil {
		return nil, err
	}

	return func() {
		restore := exec.Command("stty", state)
		restore.Stdin = os.Stdin
		_ = restore.Run()
		fmt.Fprint(os.Stdout, "\033[?25h")
	}, nil
}

func selectGroupsByNumber(ui *UI, groups []CleanupGroup) ([]Candidate, error) {
	ui.Line("")
	ui.Line(ui.paint(bold, "Choose cleanup targets"))
	width := terminalWidth()
	targetWidth := 18
	sizeWidth := 10
	detailWidth := width - 6 - targetWidth - 1 - sizeWidth - 2
	if detailWidth < 10 {
		detailWidth = 10
	}
	for i, group := range groups {
		ui.Line(fmt.Sprintf(
			"  %d. %s %*s  %s",
			i+1,
			padOrTruncate(group.Title, targetWidth),
			sizeWidth,
			truncate(humanBytes(group.Size), sizeWidth),
			truncate(group.Detail, detailWidth),
		))
	}
	ui.Line("")
	ui.Line("Type numbers separated by commas, or press Enter to cancel.")
	ui.Line("Example: 1,3,4")
	fmt.Fprint(os.Stdout, "> ")

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, nil
	}

	selected := make([]bool, len(groups))
	for _, part := range strings.Split(input, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n < 1 || n > len(groups) {
			return nil, fmt.Errorf("invalid selection %q", part)
		}
		selected[n-1] = true
	}

	return selectedCandidates(groups, selected), nil
}
