# Quickstart

The launcher does the setup. Run it once, you're in.

## What you need

Node 20 LTS (https://nodejs.org/). Nothing else — pnpm, dependencies
and Playwright browsers are provisioned on demand.

## Run

**Windows.** Double-click `vis.cmd`.

**macOS / Linux.** `./vis.sh` (run `chmod +x vis.sh` once if needed).

The launcher checks the Node version, enables Corepack on first run,
runs `pnpm install` (~1 minute), then starts the dev server on
http://localhost:5173. Subsequent launches are instant.

## Subcommands

| Command       | What happens                                           |
| ------------- | ------------------------------------------------------ |
| `vis`         | dev server (default)                                   |
| `vis setup`   | install dependencies and stop                          |
| `vis test`    | unit tests                                             |
| `vis build`   | production build into `dist/`                          |
| `vis preview` | build, then serve the production bundle locally        |
| `vis e2e`     | Playwright tests (auto-installs browsers on first run) |
| `vis report`  | open the last Playwright HTML report                   |

On macOS / Linux replace `vis` with `./vis.sh` (`./vis.sh test`,
`./vis.sh build`, …).

## When things go wrong

- **"Node.js not found"** — install Node 20 LTS, reopen the terminal.
- **"Node 20+ required"** — upgrade Node.
- **`pnpm install` fails** — delete `node_modules/` and retry. If it
  still fails, file the log in an issue.
- **Cesium WebGL errors in older Safari** — Safari < 16.4 lacks some
  APIs Cesium needs. The panel still mounts; the globe doesn't.
  Use Chrome, Firefox or Edge.
