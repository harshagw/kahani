/**
 * AGENTS.md — conventions for AI agents working in this repo.
 */

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Types

Keep types in **one place per layer**. Do not define duplicate shapes inline in components or route files.

| Module | Use for |
| --- | --- |
| [`lib/types/client.ts`](lib/types/client.ts) | React components, client pages, fetch response/request shapes consumed by the browser |
| [`lib/types/server.ts`](lib/types/server.ts) | API route handlers, `lib/games.ts`, DB row shapes, server-only request bodies |
| [`lib/types/shared.ts`](lib/types/shared.ts) | Cross-layer domain types with no Node/browser APIs (e.g. `Premise`) |
| [`lib/universe.ts`](lib/universe.ts) | Explorable-world generation types (`GameBible`, `SceneData`, dialogue) |

- Import client types in components with `@/lib/types/client`.
- Import server types in routes and server libs with `@/lib/types/server`.
- [`lib/types.ts`](lib/types.ts) re-exports client types for backward compatibility — prefer the explicit paths in new code.

## Documentation

- Add **JSDoc** (`/** … */`) on exported functions, types, components, and API route handlers.
- Add brief **inline comments** for non-obvious logic (quota gates, persistence, generation vs replay paths).
- Prefer comments that explain *why* (e.g. "non-owners cannot generate — edge becomes a wall") over restating the code.

## API routes (persistence)

New game persistence routes follow REST conventions:

- `GET/POST /api/games`, `GET/DELETE /api/games/[id]`
- `PUT /api/games/[id]/scenes/[sceneId]`, `PUT …/sprite`, `PUT …/finales/[outcome]`
- `GET /api/profile` — generation quota lives on the user resource, not the games collection

Use correct status codes: `200`, `201`, `204`, `401`, `403`, `404`, `422`.

## Supabase

Run [`supabase/migrations/0001_games.sql`](supabase/migrations/0001_games.sql) once for game persistence. Set `profiles.is_unlimited = true` for admin accounts that bypass `FREE_GAME_LIMIT`.
