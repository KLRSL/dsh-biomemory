# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in dsh-biomemory, please report it **privately** before public disclosure:

- Open a [private security advisory](https://github.com/KLRSL/dsh-biomemory/security/advisories/new) (preferred), or
- Email the maintainer through your GitHub contact

Please include a description of the vulnerability, steps to reproduce, and affected versions. You should receive a response within 7 days.

Please do **not** open public issues for security vulnerabilities.

## Security Notes

dsh-biomemory is **local-first**:

- All memory data is stored in a local SQLite database (`~/.dsh/biomemory/biomemory.db` via `node:sqlite`, WAL mode, zero external DB dependency) — nothing is ever sent over the network.
- The optional `petEndpoint` config is an outbound notification to a **local** service of your own choosing; it is disabled by default.
- Important memory writes require human approval; the plugin fails closed when no approval channel is available.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.6.x   | ✅ |

## Audit

Every memory write is recorded in `audit.log` under the memory root, so all writes are traceable.
