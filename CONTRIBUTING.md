# Contributing

Thanks for the interest. Scientific corrections, bug fixes, and CC0
asset additions are all welcome. Read the [Code of Conduct](CODE_OF_CONDUCT.md)
first.

## Reporting bugs

Open an issue with the `bug` label. Please include:

- browser, OS, viewport size,
- exact reproduction steps,
- what you expected and what happened,
- a deployed link or a failing test if you can.

## Proposing features

Open an issue with the `feature` label. Lead with the user-facing
problem before the proposed solution. For anything non-trivial, a
short discussion in the issue saves rework on both sides.

## Correcting the science

This is the highest-leverage contribution and we want it easy.
Open an issue with the `science` label and include:

- a peer-reviewed reference (DOI, URL or ISBN),
- the formula or constant you believe is wrong,
- the proposed replacement, ideally with a unit test asserting the
  expected value,
- a tolerance with a justification.

A slow correct PR beats a fast plausible one. If you're not sure
which way the literature leans, post the issue first and we'll work
through it together.

## Adding assets

We accept **CC0** assets. We accept **CC-BY-4.0** only when no CC0
equivalent exists. We don't accept CC-BY-NC (blocks commercial use),
CC-BY-SA (incompatible with Apache 2.0), or anything with unclear
provenance.

For each asset PR:

1. Drop the file under the appropriate `public/` subdirectory.
2. Add a row to [docs/ASSETS.md](docs/ASSETS.md): name, path, author,
   licence, source URL, date.
3. Attach a screenshot of the source page in the PR description so we
   can verify the licence.
4. CC-BY-4.0 only: also add an attribution line to the in-app credits
   surface.
5. Make sure the asset matches [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md).

## Local setup

```sh
corepack enable
pnpm install
pnpm dev                 # http://localhost:5173
```

Before opening a PR, run:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

CI runs the same five. All five must pass.

## Branch names

Use one of these prefixes:

```
feat/      fix/      chore/      docs/
refactor/  test/     ci/
```

## Commit messages

[Conventional Commits 1.0](https://www.conventionalcommits.org/).
Examples:

```
feat(physics): add Collins et al. crater size formula
fix(ui): use noopener on external links
docs(science): clarify Mastin plume tolerance
chore: bump pnpm to 9.15.1
```

Breaking changes carry `!`:

```
feat(physics)!: branded types now required at every boundary
```

## DCO sign-off

We use the [Developer Certificate of Origin](https://developercertificate.org/),
not a CLA. Sign every commit:

```sh
git commit -s -m "feat(ui): add language switch"
```

This appends `Signed-off-by: Your Name <you@example.com>` and is the
entire legal agreement covering the contribution. Unsigned commits
will be sent back for a rebase.

## PR checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (zero warnings)
- [ ] `pnpm format:check` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] User-facing change has a changeset (`pnpm changeset`)
- [ ] Docs updated where relevant (README, CLAUDE.md, docs/)
- [ ] Every commit signed off
- [ ] No new asset without a [docs/ASSETS.md](docs/ASSETS.md) entry
- [ ] Physics change has a unit test against a published value plus a
      JSDoc citation

That's it. Thanks for the care.
