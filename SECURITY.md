# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Monotize, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email the maintainer or use [GitHub Security Advisories](https://github.com/pmclSF/monotize/security/advisories/new)
3. Include a description of the vulnerability, steps to reproduce, and potential impact
4. Allow up to 72 hours for an initial response

## Security Considerations

Monotize executes git commands and package manager operations on your behalf. When using it:

- Only merge repositories you trust
- Review plan files before applying them with `monotize apply`
- The web UI server (`monotize ui`) binds to localhost with token authentication — do not expose it to untrusted networks
- Never embed credentials directly in repository URLs — use SSH keys or credential helpers instead
