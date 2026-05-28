package main

import (
	"fmt"
	"os"
)

type CleanupGroup struct {
	Kind       string
	Title      string
	Detail     string
	Count      int
	Size       int64
	Candidates []Candidate
}

func groupCandidates(candidates []Candidate) []CleanupGroup {
	byKind := map[string][]Candidate{}
	for _, candidate := range candidates {
		byKind[candidate.Kind] = append(byKind[candidate.Kind], candidate)
	}

	order := []string{"node_modules", "go_caches", "temp", "docker_images", "docker_containers"}
	var groups []CleanupGroup
	for _, kind := range order {
		items := byKind[kind]
		if len(items) == 0 {
			continue
		}
		title, detail := groupMeta(kind)
		groups = append(groups, CleanupGroup{
			Kind:       kind,
			Title:      title,
			Detail:     detail,
			Count:      len(items),
			Size:       groupSize(items),
			Candidates: items,
		})
	}

	return groups
}

func selectedCandidates(groups []CleanupGroup, selected []bool) []Candidate {
	var candidates []Candidate
	for i, group := range groups {
		if i < len(selected) && selected[i] {
			candidates = append(candidates, group.Candidates...)
		}
	}
	return candidates
}

func groupMeta(kind string) (string, string) {
	switch kind {
	case "node_modules":
		return "Node modules", "recursive node_modules folders under --root"
	case "go_caches":
		return "Go caches", "module, build, and test caches"
	case "temp":
		return "Temp directories", "old OS temp entries matching --older-than"
	case "docker_images":
		return "Docker images", "unused images from docker image prune -af"
	case "docker_containers":
		return "Docker containers", "stopped containers from docker container prune -f"
	default:
		return kind, "cleanup target"
	}
}

func printPlan(ui *UI, groups []CleanupGroup, verbose bool) {
	ui.Line("")
	ui.Line(ui.paint(bold, "Cleanup plan"))

	width := terminalWidth()
	targetWidth := 18
	sizeWidth := 10
	itemWidth := 5
	detailWidth := width - 2 - targetWidth - 2 - sizeWidth - 2 - itemWidth - 2
	if detailWidth < 18 {
		targetWidth = 16
		itemWidth = 4
		detailWidth = width - 2 - targetWidth - 2 - sizeWidth - 2 - itemWidth - 2
	}
	if detailWidth < 10 {
		detailWidth = 10
	}

	printPlanRow("Target", "Reclaim", "Items", "Details", targetWidth, sizeWidth, itemWidth, detailWidth)
	printPlanRow("------", "-------", "-----", "-------", targetWidth, sizeWidth, itemWidth, detailWidth)

	for _, group := range groups {
		printPlanRow(group.Title, humanBytes(group.Size), fmt.Sprintf("%d", group.Count), group.Detail, targetWidth, sizeWidth, itemWidth, detailWidth)
		if verbose {
			for _, candidate := range group.Candidates {
				labelWidth := width - 4 - sizeWidth - 1
				if labelWidth < 10 {
					labelWidth = 10
				}
				fmt.Fprintf(os.Stdout, "    %-*s %s\n", sizeWidth, humanBytes(candidate.Size), truncate(candidate.Label, labelWidth))
			}
		}
	}

	ui.Line(fmt.Sprintf("\nEstimated reclaimable space: %s", humanBytes(totalGroupSize(groups))))
}

func printPlanRow(target string, reclaim string, items string, detail string, targetWidth int, sizeWidth int, itemWidth int, detailWidth int) {
	fmt.Fprintf(
		os.Stdout,
		"  %s  %*s  %*s  %s\n",
		padOrTruncate(target, targetWidth),
		sizeWidth,
		truncate(reclaim, sizeWidth),
		itemWidth,
		truncate(items, itemWidth),
		truncate(detail, detailWidth),
	)
}

func totalGroupSize(groups []CleanupGroup) int64 {
	var total int64
	for _, group := range groups {
		if group.Size >= 0 {
			total += group.Size
		}
	}
	return total
}

func groupSize(candidates []Candidate) int64 {
	var total int64
	var known int
	for _, candidate := range candidates {
		if candidate.Size >= 0 {
			total += candidate.Size
			known++
		}
	}
	if known == 0 && len(candidates) > 0 {
		return -1
	}
	return total
}
