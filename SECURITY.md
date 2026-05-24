# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 4.x     | :white_check_mark: |
| 3.x     | :x:                |
| < 3.0   | :x:                |

Only the current major version (4.x) receives security updates. We recommend upgrading to the latest version.

## Reporting a Vulnerability

To report a security vulnerability, please use [GitHub Security Advisories](https://github.com/andymai/brepjs/security/advisories/new).

This provides private vulnerability reporting without requiring email.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity
  - Critical: As soon as possible
  - High: Within 2 weeks
  - Medium/Low: Next release cycle

### Disclosure Policy

We follow responsible disclosure. Once a fix is released, we will:

1. Credit the reporter (unless they prefer anonymity)
2. Publish a security advisory
3. Update the changelog with security notes

## Supply Chain

In response to the 2025–2026 wave of npm and GitHub Actions supply-chain
attacks (Shai-Hulud worm, chalk/debug compromise, tj-actions tag retag,
prt-scan AI campaign), the build is configured to fail closed on the
patterns those attacks exploited:

| Defense                                   | Where                            | What it blocks                                                                                                             |
| ----------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `min-release-age=7` (7d cooldown)         | `.npmrc`                         | Fresh malicious uploads — most are detected & taken down within hours. Would have blocked axios, chalk/debug, durabletask. |
| All GitHub Actions pinned to commit SHA   | `.github/workflows/*.yml`        | Tag-retag attacks (tj-actions class). Tags are mutable; commit SHAs are not.                                               |
| OSV scan (PRs report-only, main blocking) | `.github/workflows/osv-scan.yml` | Known-CVE versions in the lockfile.                                                                                        |
| Dependabot cooldown (7d / 14d major)      | `.github/dependabot.yml`         | Dependabot suggesting fresh-from-publish versions that would fail install anyway.                                          |
| Provenance + trusted-publisher OIDC       | `.npmrc` + npm settings          | NPM_TOKEN exposure. Publishes are signed and attested from CI.                                                             |
