# ADR-010: File scanning

Status: accepted (2026-10-02, human).

## Decision

ClamAV.

## Context

Uploaded files are scanned with ClamAV before they are activated (presign, size and magic-byte check, scan, activate). The `FileScanner` adapter hides the scanner.

## Revisit when

Need a managed scanner.

## Consequences and open points

- Written from the decision table in `docs/architecture.md` section 13 (task P0-12). Add the options that were rejected and the measurements that support the decision when this topic is worked on.
