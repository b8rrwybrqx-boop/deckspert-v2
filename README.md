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
