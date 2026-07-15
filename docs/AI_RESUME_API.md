# AI Resume API

`/api/resumes` stores Magic Resume JSON documents on server disk. It is designed as a narrow bridge for an AI agent: agent reads one document, prepares a small JSON patch, then writes only intended fields.

## Security

Set `RESUME_API_KEY` before starting server. Every API request requires either `Authorization: Bearer <key>` or `X-API-Key: <key>`. Do not put this key in browser code or commit it to Git.

Set `RESUME_DATA_DIR` to persistent directory. Docker Compose mounts `./data` at `/data`; back it up because it contains personal data.

Docker Compose includes a one-shot `init-data` service that grants its `data/` mount to the non-root web process before the web service starts.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/resumes` | List document IDs |
| `GET` | `/api/resumes/:id` | Read one resume |
| `PUT` | `/api/resumes/:id` | Replace whole document. Body `id` must equal URL ID. |
| `PATCH` | `/api/resumes/:id` | Deep-merge selected object fields. Arrays replace whole arrays. Immutable: `id`, `createdAt`. |
| `DELETE` | `/api/resumes/:id` | Delete one document |

Every successful write refreshes `updatedAt` and uses an atomic file rename.

## CLI

Run from repository root:

```bash
export MAGIC_RESUME_URL=https://resume.example.com
export MAGIC_RESUME_API_KEY='same-as-RESUME_API_KEY'
node scripts/magic-resume-cli.mjs list
node scripts/magic-resume-cli.mjs get resume-001
node scripts/magic-resume-cli.mjs patch resume-001 patch.json
```

Example `patch.json`:

```json
{
  "basic": { "title": "AI 产品经理" },
  "experience": [
    {
      "id": "exp-1",
      "company": "示例公司",
      "position": "产品经理",
      "date": "2023.01 - 至今",
      "details": "<ul><li>负责 AI 产品从调研到上线</li></ul>",
      "visible": true
    }
  ]
}
```

## AI agent workflow

1. `GET /api/resumes/:id` to retrieve current schema and existing IDs.
2. Keep `id`, `createdAt`, template fields, and any section not being edited.
3. Prefer `PATCH` for text changes. Arrays must include complete replacement contents.
4. `GET` again and check resulting content before rendering/exporting.

Use existing app JSON export as source document, then upload it with `PUT`. Current web editor still stores its working copy in browser storage; API is server-side source for CLI/AI workflows. Remote editor synchronization can be added next if required.

## Private browser import link

Set `RESUME_DEFAULT_ID` and a separate `RESUME_BOOTSTRAP_TOKEN`. Open this URL once in the target browser:

```text
https://resume.example.com/app/dashboard/resumes#cloudResume=<RESUME_DEFAULT_ID>&token=<RESUME_BOOTSTRAP_TOKEN>
```

The token stays in the URL fragment (not sent in the page request), the page imports the configured single resume to browser storage, then removes the fragment. It cannot read or write other server resumes and is separate from the AI API key.
