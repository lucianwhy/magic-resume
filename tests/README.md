# Tests

## CLI and MCP

```sh
pnpm db:start
pnpm install:playwright
pnpm test:agent
```

The agent suite uses an isolated database and web server, a real stdio MCP
client and Chromium. It checks CLI stdin/export/import, tool/resource discovery,
two-way synchronization with the browser, revision conflicts, image/credential
preservation and deletion. Both entry points start from outside the repository.
Artifacts are stored in the ignored `.local/agent-tests/` directory.

## Database storage

Start PostgreSQL before running Node tests that exercise storage:

```sh
pnpm db:start
pnpm db:migrate
pnpm test:storage
pnpm install:playwright
pnpm test:storage-browser
```

Storage tests create and remove separate randomly named databases and use only
synthetic documents. The database role needs CREATE DATABASE permission. The
browser suite starts its own local Vite server and checks legacy import, real
rich-text editing, refresh, a fresh browser, external API synchronization,
legacy queue recovery and cleanup, memory-only offline retries, exit warnings,
no browser business persistence, undo, conflict copies and deletion. Artifacts are written to
the ignored `.local/storage-tests/` directory. See
[database storage](../docs/DATABASE_STORAGE.md) for the API and migration rules.

## Existing Node tests

```sh
pnpm test:ai
```

This includes the numeric-content import regression tests in
`resume-import-content.test.ts`, storage tests and the existing AI/import tests.

## Mobile workbench regression

With a production server running (`pnpm build && pnpm start`), install both
browsers and run. The database must be running with `pnpm db:migrate` applied:

```sh
pnpm exec playwright install chromium webkit
pnpm test:mobile
```

Use production mode to avoid the development-only React Grab overlay intercepting
touch input. Set `TEST_BASE_URL` to use another server address. The suite checks tab switching,
short and narrow viewports, simulated 34px bottom insets, editing, desktop layout,
and releasing the page scroll lock when leaving the workbench in Chromium and
WebKit. Viewport resizing approximates available-space changes; physical iOS
keyboard and Safari toolbar behavior still require a device check.

## Body font size browser regression

Requires Node.js 20.19+ (or a supported newer release), the project's pnpm
dependencies, and a Playwright Chromium browser:

```sh
pnpm install --frozen-lockfile
pnpm install:playwright
```

On Linux CI, install browser system dependencies with
`pnpm exec playwright install --with-deps chromium`.

Start the **development** server in one terminal, then run the test in another:

```sh
pnpm dev --host 127.0.0.1 --port 3000 --strictPort
```

```sh
pnpm test:font-size
```

The test uses Vite module imports to exercise existing export and import functions,
so a production/preview server cannot replace the development server. Set
`TEST_BASE_URL` if the development server uses a different address. Optionally set
`TEST_BROWSER_CHANNEL` to `msedge` or `chrome` to use an installed browser instead
of Playwright's bundled Chromium. For example, in PowerShell:

```powershell
$env:TEST_BROWSER_CHANNEL = 'msedge'
pnpm test:font-size
```

Each run creates an isolated browser context and synthetic resume data with
unique IDs, then deletes only its own documents through the database API. The
database and migration must be ready before starting the application.
Screenshots are written under
`node_modules/.cache/font-size/` and should not be committed. The test requires
the local application to load; font and image assets referenced by its sample
resume may require network access.

Coverage includes mouse selection, partial and mixed sizes, default/reset,
formatting preservation, cross-list selections, undo/redo, persistence, global
size inheritance, unchanged section headings, English labels, narrow toolbars,
all nine templates and six body editor entry points. JSON export is downloaded
and passed back through the store's import function. The test also checks a local
long-page PDF download and captures the browser-print document without opening a
print dialog.

The PDF check validates download generation, not visual correctness of every PDF
page. The external PDF service is not contacted. Review screenshots and actual
export layout separately when changing typography or pagination.

## Workspace settings persistence

Run `pnpm test:workspace` after starting local PostgreSQL. The suite creates and drops its own random database. It covers AI credential migration, preferences, browser readback, serialized rapid edits, lost acknowledgements, conflicting writers, legacy IndexedDB cleanup, and directory reauthorization after refresh. Browser tests prohibit Storage.setItem, and fresh-browser tests also prohibit indexedDB.open. Credentials are synthetic and no real provider calls are made. Artifacts are excluded from Git under `.local/workspace-tests`.
