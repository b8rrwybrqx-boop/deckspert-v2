# Deckspert v2

Fresh implementation of Deckspert v2 with a shared storytelling core and three independent tools:

- Presentation Evaluator
- Story Creator
- Story Coach

## Stack

- Node.js + TypeScript
- React + Vite
- Vercel-style `/api` serverless handlers
- OpenAI-compatible LLM client with schema validation and fallback mode

## Scripts

```bash
npm install
npm run dev
npm run typecheck
```

## Notes

- If `OPENAI_API_KEY` is missing, the app falls back to deterministic local logic so the workflows still function for MVP testing.
- Artifact ingestion supports text extraction for document-like inputs and vision summaries for image-like inputs supplied as text content in the request payload.
- **Data retention:** hosted content and derived outputs are deleted once older than `DATA_RETENTION_DAYS` (default 90), by a daily Vercel Cron, and on demand via `POST /api/data-deletion`. Both the database rows and the stored Vercel Blob files are removed. The scheduled purge requires `CRON_SECRET` to be set in production or it will not run. See [docs/data-retention.md](docs/data-retention.md).
