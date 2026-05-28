# cleanuptool

A small cross-platform Go CLI for freeing space on development machines. It can clean:

- `node_modules` directories under a workspace root
- Go module, build, and test caches
- unused Docker images
- stopped Docker containers
- old entries in OS temp directories on macOS, Linux, and Windows

The tool is intentionally guarded. It previews with `--dry-run`, shows a grouped cleanup plan, then lets you choose targets with Space and run them with Enter. It only skips selection when you pass `--yes`.

## Build

```sh
go build -o cleanuptool .
```

Or:

```sh
make build
```

## Install

Install it as `cleanuptool` in your Go bin directory:

```sh
make install
```

Make sure your Go bin directory is on your `PATH`. On macOS this is usually:

```sh
export PATH="$PATH:$(go env GOPATH)/bin"
```

## Examples

Open the interactive cleaner:

```sh
cleanuptool --root /Users/Github
```

Preview everything in your GitHub workspace:

```sh
cleanuptool --dry-run --all --root /Users/Github
```

Clean everything without an interactive prompt:

```sh
cleanuptool --all --yes --root /Users/Github
```

Only remove `node_modules` and temp entries older than 14 days:

```sh
cleanuptool --node-modules --temp --older-than 14 --root /Users/Github
```

Include user cache folders too:

```sh
cleanuptool --temp --include-user-caches --older-than 30 --yes
```

## Flags

```text
--all                  enable all cleanup targets
--node-modules         recursively delete every node_modules directory under --root
--go-caches            clean Go module, build, and test caches; does not delete go.mod files
--docker               prune unused Docker images and stopped containers
--temp                 delete old entries from OS temp directories
--dry-run              preview cleanup without deleting anything
--yes, -y              skip confirmation prompts
--root                 workspace root to scan recursively for node_modules
--older-than           only delete temp entries older than this many days
--include-user-caches  include ~/Library/Caches, ~/.cache, or Windows local app data
--max-depth            max directory depth for node_modules scan; 0 means unlimited
--verbose              print every removed path
```

When no target flag is provided, targets default to `--all`.
`node_modules` scanning is fully recursive by default. Use `--max-depth` only if you want to limit the scan.

In interactive mode:

```text
Space  select/unselect a cleanup target
Enter  run selected cleanup targets
a      select/unselect all
q      cancel
```
