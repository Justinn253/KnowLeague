# Supabase Guidance

## Migrations
- Migrations are append-only. Never rewrite an applied migration to change production state.
- Use the next numeric migration prefix and a descriptive snake_case name.
- Keep RLS, grants, indexes, Realtime publication, and replica identity requirements explicit.
- Make migrations safe for existing data and avoid destructive backfills without approval.
- Never place secrets in migrations or committed environment examples.

## Workflow
- Inspect existing migrations before changing a table or policy.
- Create the migration locally first.
- Run `npx supabase db push` only when the user asks to apply database changes or the task explicitly requires deployment.
- Report whether a migration was created and whether it was pushed.
