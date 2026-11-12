# Vagtplan (arbejdsnavn)

Dansk vagtplanlægning og tidsregistrering, som kan konfigureres til de fleste danske overenskomster uden kodeændringer.

> Systemet hjælper med overholdelse af reglerne, men erstatter ikke juridisk rådgivning.

- Plan og faser: [`docs/plan.md`](docs/plan.md)
- Datamodel: [`docs/datamodel.md`](docs/datamodel.md)
- Juridiske åbne punkter: [`docs/jura-todo.md`](docs/jura-todo.md)
- Udviklerregler: [`CLAUDE.md`](CLAUDE.md)

## Kom i gang lokalt

Kræver Node 22, pnpm 10 og Docker.

```bash
pnpm install
pnpm db:start                         # lokal Supabase (migrations + seed)
cp apps/web/.env.example apps/web/.env.local
pnpm dev                              # http://localhost:3000
```

Log ind med `admin@demo.dk` / `Demo1234!`. Flere demo-brugere står i `CLAUDE.md`. Mails (invitationer og login-links) kan ses i Mailpit på http://127.0.0.1:54324.

## Test

```bash
pnpm check     # format, lint, typecheck, unit tests
pnpm db:test   # pgTAP (RLS)
pnpm e2e       # Playwright
```
