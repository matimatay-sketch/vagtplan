# CLAUDE.md – projektregler

**Turnus** – dansk vagtplan- og tidsregistreringssystem (Quinyx/Planday-klasse), konfigurerbart til danske overenskomster uden kodeændringer. Planen ligger i `docs/plan.md`.

## Uomgængelige regler

1. **Domæneregler følger skillen `dansk-arbejdstid`.** Læs den før du ændrer regelmotor, datamodel eller løn.
2. **Hardkod aldrig en arbejdstidsregel eller sats.** Alt ligger i versionerede overenskomstdokumenter med kilde og gyldighed. Ingen `if (agreement === "X")`. Mangler der en primitiv, så tilføj en _generisk_ primitiv.
3. **Juridisk tvivl:** Brug en pladsholder, skriv `TODO(jura)`, før punktet op i `docs/jura-todo.md` og spørg brugeren. Gæt aldrig en sats eller en regel.
4. **Tid:** Gem i UTC (`timestamptz`). Døgn, ugedage og tillægsvinduer beregnes i `Europe/Copenhagen`. Kalenderdatoer (kontrakter, fødselsdatoer) er `date` / ISO-strenge `YYYY-MM-DD`. Test altid sommertid.
5. **Penge** er heltal i øre, og **varighed** er heltal i minutter. Ingen floats i løn.
6. **Intet slettes hårdt** fra forretningstabeller (brug `archived_at` / rettelser med spor). Alle tabeller har audit-trigger.
7. **Multi-tenant:** Alle forretningstabeller har `organization_id`. RLS er den egentlige adgangskontrol, og UI-tjek er kun bekvemmelighed.
8. **Adgang styres af rettighedsprofiler, ikke faste roller.** Tjek altid en _rettighed_ (fx `employees.manage`), aldrig et profilnavn. En ny funktion får en ny nøgle i `public.permission` (migration) og i `apps/web/src/lib/permissions.ts` (en test holder dem i sync). Omfanget er `departments` (de afdelinger, brugeren er ansvarlig for) eller `organization`. Ejer-profilen (`is_owner`) er låst og skal have nye rettigheder tildelt i den migration, der tilføjer dem.
9. **Sprog:** Al UI-tekst er på dansk og ligger i `apps/web/src/lib/i18n/da.ts`. Kode, identifiers og commits er på engelsk.

## Struktur

```
apps/web                 Next.js 16 (App Router), Tailwind v4, shadcn-stil komponenter i src/components/ui
  src/lib/auth.ts        Data Access Layer: getAppContext()/requireContext(anyOfPermissions)/canIn()
  src/lib/permissions.ts Rettighedskatalog (labels, tilladte omfang, implikationer)
  src/lib/actions/*      Server actions (Zod-validering → RLS-klient → revalidate)
  src/lib/forms/*        Zod-skemaer til formularer (unit-testet)
  src/lib/domain/*       Rene hjælpefunktioner (datoer, alder, kontrakter, lønperioder)
  e2e/                   Playwright
packages/rules-engine    Ren TS: ingen DB, intet UI og ingen Node-API'er (håndhæves af ESLint). Se docs/regelmotor.md
packages/agreements      Overenskomst-skabeloner (JSON) + golden fixtures; genererer supabase/seeds/agreements.sql
supabase/migrations      Skema, RLS, audit, RPC
supabase/tests           pgTAP (RLS og integritet)
supabase/templates       Danske e-mailskabeloner (token_hash-flow)
```

## Kommandoer

```bash
pnpm install
pnpm db:start            # lokal Supabase i Docker (kræver kørende Docker-daemon)
pnpm db:reset            # migrations + seed fra bunden
pnpm db:test             # nulstiller DB til seed og kører pgTAP
pnpm db:types            # regenerér apps/web/src/lib/supabase/database.types.ts efter migrations
pnpm dev                 # http://localhost:3000
pnpm check               # format, lint, typecheck, unit tests – kør før HVER commit
pnpm e2e                 # Playwright (starter dev-server hvis den ikke kører)
```

Demo-brugere (seed), alle med adgangskoden `Demo1234!`: `admin@demo.dk`, `leder@demo.dk` (profilen Leder, ansvarlig for Butik), `medarbejder@demo.dk` og `ung@demo.dk` (16 år).

## Arbejdsform

- TDD i regelmotoren og i `src/lib/domain` / `src/lib/forms`: rød → grøn → refaktorér. Dæk grænseværdier, midnat, sommertid og stabling.
- Små, beskrivende commits på engelsk. `pnpm check` og `pnpm db:test` skal være grønne før commit. E2E skal være grønne før en fase afsluttes.
- Ny migration: tilføj pgTAP-tests for nye RLS-politikker. Regenerér typerne.
- Ændret overenskomst-JSON: kør `pnpm --filter @vagtplan/agreements seed` og opdatér/tilføj golden fixtures. Forventede beløb regnes i hånden, ikke kopieret fra motorens output.
- Ny regel i motoren: tilføj en _generisk_ primitiv i `src/agreement/schema.ts` med tests, aldrig specialkode for én overenskomst.
- Stop efter hver fase og bed brugeren om godkendelse (se `docs/plan.md`).

## Tekniske valg og faldgruber

- **Next 16:** `middleware` hedder nu `proxy` (`src/proxy.ts`). `cacheComponents` er bevidst slået fra, fordi næsten alt er per bruger. Læs `node_modules/next/dist/docs/` før brug af nye API'er.
- **Zod 4:** Brug `z.guid()` til id'er. `z.uuid()` afviser seed-id'er uden versionsbits. Ukrydsede checkboxe sendes slet ikke i FormData, så brug `.nullish()`.
- **Radix DropdownMenu:** En `<form>` inde i et menupunkt bliver ikke sendt, fordi menuen lukker først. Kald en server action fra `onSelect`.
- **Supabase-embeds** med sammensatte FK'er kræver eksplicit FK-navn, fx `department!employee_department_organization_id_department_id_fkey (name)`.
- **shadcn-registret** (ui.shadcn.com) er blokeret i sandkassen. Komponenter skrives i shadcn-stil i `src/components/ui`.
- **Vagtplan:** Live-opdateringer (`RealtimeRefresh`) venter, mens `document.body.dataset.scheduleBusy` er sat (under træk og ændring af længde), så tavlen ikke tegnes om midt i et træk. `DndContext` skal have et stabilt `id` (`useId`), ellers opstår der en hydration-fejl.
- **Offentliggørelse** sker kun via `publishAction` → service-klient → `publish_schedule` (DB-funktionen tjekker aktørens rettigheder igen). Klienten sender kun begrundelser. Overtrædelserne beregnes altid igen på serveren.
- **Client- og servermoduler:** En funktion fra en `"use client"`-fil kan ikke kaldes fra en server-komponent (fx `formatSupplementAmount`). Delte hjælpere lægges i `src/lib/domain/`.
- **Pauser og tillæg** ligger som JSON eller uuid-liste på vagten (ikke i separate tabeller), så de indgår i ændringsdetektion og i snapshottet ved offentliggørelse.
- **Undtagelse fra "intet slettes hårdt":** `rotation_line` og `rotation_slot` er skabelonkonfiguration og må slettes. De auditeres.
- **Service-klienten** (`createServiceClient`) må kun bruges efter at databasen har bekræftet brugerens rettighed (`rpc("can_on_employee", …)`, se `inviteEmployeeAction`).
