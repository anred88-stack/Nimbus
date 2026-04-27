# Security policy

## Reporting a vulnerability

Please do not file a public issue. Email **security@example.com** with:

- a description of the vulnerability,
- steps to reproduce or a proof of concept,
- the version or commit affected,
- any mitigation you've already applied locally.

We aim to acknowledge reports within 72 hours, share an initial
assessment within 7 days, and ship a fix or a written explanation
within 30 days for confirmed issues.

If a fix requires a coordinated disclosure window, we'll agree on it
with you in writing.

## Supported versions

The latest published `1.x` minor on `main` is supported. Older minors
receive security fixes only when an active deployment depends on them
and the maintainers have been notified.

## Out of scope

- Findings that depend on a custom build with security-relevant
  defaults disabled.
- Issues in third-party services (Cloudflare Pages, GitHub Actions,
  npm registry) that don't originate in this repository.
- Best-practice suggestions without a concrete impact path.

## Hall of fame

Reporters who follow this process will be credited in the release
notes for the fix unless they ask not to be.
