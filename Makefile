BINARY := cleanuptool
GOCACHE_DIR := $(CURDIR)/.gocache
GOBIN ?= $(shell go env GOPATH)/bin

.PHONY: build install test dry-run clean

build:
	GOCACHE=$(GOCACHE_DIR) go build -o $(BINARY) .

install:
	GOBIN=$(GOBIN) GOCACHE=$(GOCACHE_DIR) go install .
	@echo "Installed $(BINARY) to $(GOBIN)/$(BINARY)"

test:
	GOCACHE=$(GOCACHE_DIR) go test ./...

dry-run: build
	./$(BINARY) --dry-run --all --root /Users/Github

clean:
	rm -f $(BINARY)
	rm -f cleanup-tool
	rm -rf $(GOCACHE_DIR)
