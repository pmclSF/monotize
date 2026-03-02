# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Full lifecycle CLI commands: `add`, `archive`, `configure`, `migrate-branch`
- Extended analysis engine with environment, tooling, CI, publishing, and repo risk detection
- Risk classification system (straightforward / needs-decisions / complex)
- Path-filtered GitHub Actions workflow generation
- Configure engine for Prettier, ESLint, and TypeScript scaffolding
- Dependency enforcement via package manager overrides/resolutions
- Multi-language detection (Go, Rust, Python) with workspace scaffolding
- Smart defaults with evidence-based suggestions
- Performance utilities (concurrent mapping, disk space checks, progress events)
- Cross-platform path normalization
- 8-step wizard UI with SeverityBadge, DiffViewer, TreePreview, FindingsFilter components

### Security
- Fixed Python injection vulnerability in history preservation (SEC-01)
- Fixed path traversal vulnerability in apply command (SEC-02)
- Added install command executable allowlist (SEC-04)
- Replaced shell `exec()` with `execFile()` in browser opener (SEC-05)
- Added server authentication via shared-secret token (SEC-03)
- Added CORS, rate limiting, and body size limits to server
- Added symlink protection to file operations

### Fixed
- Async `.filter()` bug in gitignore merge that caused all paths to be included
