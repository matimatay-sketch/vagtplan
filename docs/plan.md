# Plan – dansk vagtplan og tidsregistrering (MVP, fase 1–6)

> Status: **godkendt 2026-11-12**. Fase 1–3 er godkendt (fase 3 den 2026-11-13). Fase 3b (tilføjelser og projektregistrering) er godkendt 2026-11-13. Fase 4 (tidsregistrering) er godkendt 2026-11-13. Fase 5 (fravær, ferie og rådighed/tilkald) er godkendt 2026-11-14. Ferietillæg, feriegodtgørelse og sygeløn beregnes i lønsystemet, ikke i Turnus (besluttet 2026-11-14). Fase 6 (løn, eksport og overenskomst-admin) er godkendt 2026-11-15. Alle faser i MVP er godkendt. Planen blev godkendt med tilføjelsen at fravær, ferie og rådighed/tilkald er med i MVP (ny fase 5; løn og eksport er nu fase 6).
> Domænereglerne følger skillen `dansk-arbejdstid`. Produktnavn: **Turnus**.

## 0. Beslutninger fra brainstorm

| #   | Emne                  | Beslutning                                                                                                                                                                                                                                                    |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Repo                  | `matimatay-sketch/vagtplan`, monorepo med pnpm workspaces                                                                                                                                                                                                     |
| 2   | Supabase              | Kun lokalt i Docker (`supabase start`) i MVP. Alt schema ligger som migrations i repoet, så et hostet projekt senere bare er `supabase db push`                                                                                                               |
| 3   | Multi-tenant          | Ja. `organization_id` på alle forretningstabeller, og RLS håndhæver det                                                                                                                                                                                       |
| 4   | Adgang                | **Konfigurerbare rettighedsprofiler** pr. kunde (besluttet 2026-11-12). Hver rettighed har omfanget "egne afdelinger" eller "hele virksomheden". Standardprofilerne er Administrator (låst), Leder og Medarbejder. En medarbejder kan være i flere afdelinger |
| 5   | Eksempel-overenskomst | Fiktiv `eksempel-detail` med pladsholder-satser, tydeligt markeret som fiktiv i både data og UI                                                                                                                                                               |
| 6   | Juridiske huller      | Udelades indtil videre (se §6). Referenceperioden for 48-timersreglen er 4 måneder                                                                                                                                                                            |
| 7   | Lønperioder           | Uge, 14 dage og måned kan vælges pr. **lønperiode-gruppe** (fx timelønnede 14 dage og funktionærer måned). Begge lønformer understøttes: time- og månedsløn                                                                                                   |
| 8   | Stempling             | PWA med offline-kø (IndexedDB) og synkronisering. Kilde og enhed gemmes. Geofence og kiosk kommer efter MVP                                                                                                                                                   |
| 9   | Persondata            | Intet CPR-nummer. Fødselsdato, flag for undervisningspligt og medarbejdernummer (bruges som eksportnøgle)                                                                                                                                                     |
| 10  | Navn og farver        | **Turnus**, visuel retning "Nattevagt" (blækblå og koral). Besluttet 2026-11-12                                                                                                                                                                               |

## 1. Arkitektur

```
vagtplan/
├─ apps/web/                    Next.js (App Router), TS strict, Tailwind, shadcn/ui, PWA (Serwist)
├─ packages/rules-engine/       Ren TypeScript: ingen DB, intet UI, intet netværk. Vitest
├─ packages/agreements/         Overenskomst-dokumenter (JSON) + golden fixtures
│   ├─ basis-dk/v1.json
│   ├─ basis-dk/fixtures/*.json
│   ├─ eksempel-detail/v1.json  (FIKTIV)
│   └─ eksempel-detail/fixtures/*.json
├─ packages/export/             Eksport-adaptere (CSV-generisk i MVP)
├─ supabase/                    migrations, seed.sql, tests (pgTAP til RLS)
├─ e2e/                         Playwright
├─ docs/                        plan.md, datamodel.md, regelmotor.md, jura-todo.md
└─ CLAUDE.md                    projektets regler
```

**Grundvalg**

- **Tid:** gemmes i UTC (`timestamptz`). Al døgn-, ugedags- og vinduesberegning sker i `Europe/Copenhagen` via `Temporal` (polyfill), som håndterer sommertid korrekt. Varigheder regnes i hele minutter.
- **Penge:** heltal i øre. Satser i øre pr. time eller i basispoint (1/100 %). Ingen floats i løn.
- **Overenskomster:** Skabeloner ligger som filer i `packages/agreements` og seedes i databasen (`agreement_version.document jsonb`). Admin redigerer databaseversionen i fase 6. Begge valideres af det samme Zod-skema fra regelmotoren.
- **Regelmotoren** udstiller fire rene funktioner:
  `resolveAgreement(layers)`, `validateSchedule(input)`, `calculatePay(input)` og `simulateWeek(input)`.
  Next.js kalder dem på serveren (server actions/route handlers). Motoren kender aldrig til Supabase.
- **Audit:** Postgres-triggere skriver `audit_log` (aktør, tabel, række, handling, før/efter) på alle muterbare tabeller. `time_entry` og `pay_line` kan ikke slettes, kun rettes med `supersedes_id`.
- **Alvor:** `BLOCKING` / `WARNING` i koden, vist som "Blokerende" / "Advarsel" i UI'en.

## 2. Datamodel (overblik – detaljer i `docs/datamodel.md` i fase 1)

| Fase | Tabeller                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `organization`, `membership` (user ↔ org ↔ rolle), `department`, `department_manager`, `employee`, `employee_department`, `agreement`, `agreement_version`, `pay_period_group`, `contract`, `audit_log`                         |
| 3    | `shift_template`, `shift`, `availability`, `shift_wish`, `schedule_publication`, `rule_violation`                                                                                                                               |
| 4    | `clock_event` (rå stempling), `time_entry` (faktisk tid eller dagstotal, kilde, status, godkendt_af)                                                                                                                            |
| 5    | `absence_type`, `absence` (periode, status, godkendt_af), `absence_balance_entry` og `vacation_ledger_entry` (posteringer, aldrig overskrevne saldi), `shift.kind = on_call` (rådighed), `time_entry.kind = call_out` (tilkald) |
| 6    | `pay_period`, `pay_line` (med forklaring jsonb), `pay_code_mapping`, `export_run`                                                                                                                                               |

Vigtige constraints:

- `contract` har en exclusion-constraint, så den samme medarbejder ikke kan have overlappende kontrakter. Skift midt i en periode er to kontrakter.
- `contract` peger på `agreement` og har et valgfrit lokalaftale-lag og et kontraktlag (`overrides jsonb`), plus personalegruppe, trin, anciennitetsdato, lønform, ugentlige timer, lønperiode-gruppe og `exempt_from_registration` (med dato og begrundelse).
- RLS: hjælpefunktioner `auth_org_ids()`, `auth_role(org)` og `auth_managed_departments()` (security definer). Medarbejdere ser deres egne data og den publicerede vagtplan for deres afdelinger.

## 3. Regelmotoren

### 3.1 Dokument og arv

- Dokumentet har `id`, `name`, `version`, `valid_from`, `valid_to`, `inherits_from`, `source` og `rules[]`. Hver regel har `id`, `primitive`, `params`, `severity`, `source` (hjemmel), `stacking` og `priority`.
- Lag: `basis-dk` → overenskomst → lokalaftale → kontrakt. En regel med samme `id` merges felt for felt, `remove: true` fjerner den, og nye `id`'er tilføjes.
- Skemaet advarer, når en værdi er ringere end i `basis-dk` og ingen `legal_basis` er angivet.
- Versionsvalg sker pr. dato: et interval beregnes med den version, der gjaldt på intervallets lokale dato.

### 3.2 Primitiver i MVP

| Primitiv                 | Fase 2 | Bemærkning                                                                                                                           |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NormTid`                | ✅     | uge / N uger / årsnorm, dagsnorm, deltid min./maks.                                                                                  |
| `Overarbejde`            | ✅     | udløsere: dag, uge, periode, uden for planlagt vagt. Trin, udbetaling eller afspadsering                                             |
| `Tidsvinduestillæg`      | ✅     | ugedage, klokkeslæt, dagtyper, kr./t eller %, personalegrupper                                                                       |
| `Helligdagskalender`     | ✅     | påskeberegning, hele/halve dage, særdage fra overenskomsten                                                                          |
| `Pause`                  | ✅     | udløser, længde, betalt/ubetalt                                                                                                      |
| `Hviletid` (+ fridøgn)   | ✅     | 11 t og 24 t fridøgn, nedsættelse via parametre                                                                                      |
| `MaksUgentligGennemsnit` | ✅     | 48 t over 4 mdr. Advarsel ved prognose over 44 t                                                                                     |
| `MinVagtlængde`          | ✅     |                                                                                                                                      |
| `Natarbejde`             | ✅     | definition af nattetid, gennemsnit                                                                                                   |
| `Afrunding`              | ✅     | stemplingsafrunding og tolerance                                                                                                     |
| `Lønsats`                | ✅     | trin, ungesatser pr. alder, datostyrede reguleringer                                                                                 |
| `UngeBegrænsning`        | ✅     | kun de værdier, der står i skillen (se §6)                                                                                           |
| `Varsling`, `Weekendfri` | fase 3 | validering af vagtplan                                                                                                               |
| `RådighedTilkald`        | ✅     | sats pr. rådighedstime, minimumsbetaling ved tilkald, samspil med hviletid                                                           |
| `Fravær`                 | ✅     | typer, optjening (fx omsorgsdage), betaling (fuld løn / norm / ingen), dækning af planlagte vagter                                   |
| `Ferie`                  | ✅     | optjening som posteringer, feriefridage, ferie med løn vs. feriegodtgørelse, særlig feriegodtgørelse – alle satser fra konfiguration |

### 3.3 Pipeline (`calculatePay`)

1. **Afrund** stemplinger efter `Afrunding`.
2. **Segmentér** arbejdstid ved midnat, vinduesgrænser, helligdagsgrænser, normoverskridelse og kontrakt- eller versionsskift.
3. **Klassificér** hvert segment: normaltid, overarbejdstrin og tillægskandidater.
4. **Stabl** pr. segment. Først fjernes `erstatter:[ids]`. Findes der en `eksklusiv` kandidat, vinder den med højest prioritet alene. Ellers beholdes den højeste i hver `højeste`-gruppe, og alle `additiv` lægges til.
5. **Lønlinjer:** `{payCode, quantityMinutes, rateOre, amountOre, explanation[]}`. Hver forklaring peger på regel, lag, version og interval.

### 3.4 Tests (TDD)

Hver primitiv skrives test først. Tests der skal findes mindst:

- hvile på præcis 11:00 t (ok) mod 10:59 (blokerende)
- vagt over midnat
- vagt over sommertidsskift, marts (23-timersdøgn) og oktober (25-timersdøgn)
- vagt der krydser to tillægsvinduer
- helligdag der falder på en søndag
- påskedage for flere år
- en ung der fylder 18 midt i en uge (og 15)
- skift af overenskomst midt i en referenceperiode
- stabling af overarbejde og aftentillæg i alle fire stablingstilstande
- grænser for 44 og 48 timer
- pause ved præcis 6:00 mod 6:01 timer
- **Golden tests:** `basis-dk` og `eksempel-detail` med mindst 5 testuger hver. De køres i CI.

## 4. Faser, opgaver og acceptkriterier

Rækkefølge: 1 → 2 → 3 → 4 → 5 → 6. Hver fase slutter med: grønne tests, ingen TS-fejl, lint ok, flowet kørt i browseren med Playwright og et kort resumé. **Jeg stopper og venter på din godkendelse efter hver fase.**

### Fase 1 – Fundament

Opgaver:

1. Monorepo (pnpm, delt tsconfig strict, ESLint, Prettier), `CLAUDE.md` med projektregler, GitHub Actions (lint, typecheck, test).
2. Next.js-app med Tailwind og shadcn/ui, designtokens (lys/mørk), dansk UI-tekst samlet i én ordbog.
3. Navn og visuel identitet (vi vælger sammen ud fra 3 skitser).
4. Supabase lokalt: migrations for fase 1-tabellerne, audit-triggere, RLS-politikker og seed (1 demo-organisation, 2 afdelinger, admin, leder og 3 medarbejdere, heraf én ung).
5. Auth (e-mail og adgangskode, magic link via den lokale mail-catcher), rollebaseret navigation og beskyttede ruter.
6. CRUD-sider: afdelinger, medarbejdere (inkl. fødselsdato og undervisningspligt) og kontrakter (med overenskomst, lønform, lønperiode-gruppe og gyldighed).

Acceptkriterier:

- `pnpm test`, `pnpm lint`, `pnpm typecheck` og `supabase test db` er grønne.
- pgTAP-tests viser, at en leder ikke kan se medarbejdere i andre afdelinger, at en medarbejder kun ser sig selv, og at to organisationer ikke kan se hinanden.
- Overlappende kontrakter afvises. Ændringer giver rækker i `audit_log`.
- Playwright: log ind som hver rolle og opret en afdeling, en medarbejder og en kontrakt.

### Fase 2 – Regelmotor

Opgaver:

1. Zod-skema for dokument og primitiver, `resolveAgreement` med arv og advarsler om lovens minimum.
2. Tidsværktøjer (Copenhagen-døgn, sommertid) og helligdagskalender.
3. Primitiverne fra §3.2, hver med TDD.
4. Pipeline: segmentering, klassificering, stabling, lønlinjer og forklaring.
5. `validateSchedule` med alvorsgrader.
6. `basis-dk` v1 og den fiktive `eksempel-detail` v1 med golden fixtures. `docs/regelmotor.md`.

Acceptkriterier:

- Alle testtilfælde i §3.4 findes og er grønne. Motoren har 100 % branch coverage på primitiverne.
- `rules-engine` har ingen afhængigheder ud over `zod` og `temporal-polyfill` (tjekkes med en lint-regel).
- Ingen `if (agreement === …)`-kode. Alt styres af parametre.

### Fase 3 – Vagtplan

Opgaver:

1. Uge- og dagsvisning pr. afdeling med drag-and-drop (flyt, kopiér, ændr længde) og live-opdatering via Supabase Realtime.
2. Vagtskabeloner, og "kopiér uge".
3. Kladde → publicer: hele perioden valideres med `validateSchedule`. Blokerende fejl kræver override med begrundelse, som gemmes i `rule_violation`. Advarsler vises.
4. `Varsling` og `Weekendfri`.
5. Medarbejderens tilgængelighed og ønsker, som er synlige for lederen under planlægning.
6. Medarbejdervisning: "Min vagtplan" (mobilvenlig).

Acceptkriterier:

- At planlægge 10 t 59 min hvile blokerer publicering. Override med begrundelse lykkes og logges.
- En vagt over sommertidsskiftet vises og valideres korrekt.
- Den unge medarbejders regler slår til automatisk.
- Playwright: lederen planlægger en uge, får en fejl, laver override og publicerer. Medarbejderen ser sin plan.

### Fase 3b – Tilføjelser til vagtplanen (ønsket 2026-11-13)

- Flere pauser pr. vagt: betalt eller ubetalt, med eller uden fast tidspunkt. Pauser uden tidspunkt fordeles jævnt ved validering.
- Opsætningssiden (kun administratorer som standard): varsling i timer, regelhåndtering pr. type regelbrud (blokér eller tilsidesæt permanent; regelbruddet vises altid), typer af vagttillæg.
- Vagttillæg på vagter, skabeloner og turnusser. De bliver til lønlinjer i motoren.
- Ugens timer mod kontraktens norm i ugevisningen.
- Turnusværktøj: ugeskabeloner og turnusser over N uger med linjer, redigering i et skema, kopiering af uger, udrulning med medarbejder og startuge pr. linje, "udrul igen" (kun vagter, der aldrig er offentliggjort).
- Projektregistrering (ønsket 2026-11-13):
  - Projekter har projektnummer, navn, kunde (valgfri) og kan arkiveres. De kan begrænses til bestemte afdelinger. Rettighederne er `projects.manage` (organisation; som standard administratorer) og `projects.view` (afdelinger eller organisation; som standard Leder i egne afdelinger).
  - En vagt kan deles mellem flere projekter: tidsrum, antal minutter eller "resten af vagten". Ubetalte pauser trækkes fra.
  - Vagtskabeloner og turnusvagter kan have et standardprojekt.
  - Siden Projekter viser timer pr. projekt og pr. medarbejder for en periode og en afdeling. Den har CSV-eksport (semikolon, UTF-8 med BOM) og påvirker ikke lønnen.
  - Betalte pauser tæller som arbejdstid i arbejdstidsreglerne (jura-todo nr. 16, besluttet 2026-11-13).

### Beslutning: opsætning af en ny kunde (2026-11-13)

En kunde bestiller en base (organisation). Den person, der konfigurerer den (fx en konsulent), får administratoradgang og sætter det hele op for kunden. Derfor oprettes administratoren **ikke** automatisk som medarbejder. Administratorer, der også arbejder i virksomheden, oprettes som medarbejdere på almindelig vis.

Bygget 2026-11-13: Selvbetjeningen er fjernet. En platformsadministrator opretter kunder på `/platform`, inviterer kundens administrator (eller giver en eksisterende bruger adgang) og kan arkivere og genåbne kunder. En arkiveret kundes brugere mister adgangen, og intet slettes.

### Fase 4 – Tidsregistrering

Opgaver:

1. PWA: installérbar, stempl ind/ud, offline-kø med idempotent synkronisering (klient-UUID).
2. "Gennemført som planlagt" med ét klik pr. vagt eller pr. dag.
3. Afvigelser: manuel rettelse med begrundelse og afrunding efter overenskomsten.
4. Løbende validering (hviletid, pause) og validering ved dagsafslutning.
5. Lederens godkendelsesliste med filter og massegodkendelse. Rettelser laver en ny række med `supersedes_id`.
6. Audit-log-visning pr. registrering.
7. Projektfordelingen arves fra den planlagte vagt til den registrerede tid. Medarbejderen kan rette den, indtil tiden er godkendt. Projektoversigten og CSV-eksporten viser også faktisk registreret tid.

Beslutninger (bekræftet af bruger 2026-11-13):

- En leder med afdelingsomfang kan ikke godkende sin egen tid. Den godkendes af en anden med `time.approve` for afdelingen, fx lederens egen leder eller en administrator.
- Offline-stemplinger: Enhedens tidspunkt accepteres op til 7 dage tilbage. Afviger det mere end 5 minutter fra serverens ur, markeres stemplingen "Sendt offline".

Status (bygget 2026-11-13):

- `/tid` (medarbejder): stempling med offline-kø, "Gennemført som planlagt" pr. vagt eller samlet, egne registreringer pr. dag med dagens arbejdstid, rettelse med begrundelse og historik.
- `/tid/godkend` (leder): uge, afdeling og status, massegodkendelse, rettelse af godkendt tid som ny version, afrunding ("afregnes"), regelbrud i den faktiske tid, undtagne medarbejdere markeret.
- Tilføjet 2026-11-15: En foreløbig beregning viser, hvilke lønarter ugens tid aktiverer, både pr. medarbejder og pr. registrering, og også før tiden godkendes. Beløb vises kun med ret til at se lønlinjer. Hver lønart har et "Hvorfor?" (regel, kilde, overenskomstversion og tidsrum), og der er en total pr. afdeling. Siden er delt i to: registreringerne til venstre (ca. 60 %) og en opsummering i tabelform til højre (ca. 40 %) med kolonnerne Lønart / fravær, Betegnelse, Antal, Sats og Beløb, pr. afdeling og pr. medarbejder.
- Appen kan installeres som PWA (manifest, ikoner og service worker i produktion).
- Ikke med endnu: slettejob efter 5 år (opbevaringsreglen) og tilkald (kommer i fase 5). Validering af faktisk tid ser 14 dage tilbage, så 48-timers-gennemsnittet er kun fuldt på vagtplanen.

Acceptkriterier:

- Stempling offline i Playwright (netværk slukket) synkroniseres uden dubletter, når netværket kommer tilbage.
- En godkendt registrering kan ikke ændres uden at der oprettes en ny version.
- Samlet daglig arbejdstid kan altid udledes for hver medarbejder (lovkrav).
- Medarbejdere, der er undtaget fra registrering, håndteres.

### Fase 5 – Fravær, ferie og rådighed/tilkald

Opgaver:

1. Fraværstyper styret af overenskomsten (syg, barns sygedag, omsorgsdage, seniordage, feriefridage, ferie, orlov m.fl.). Medarbejderen anmoder, og lederen godkender. Sygdom kan lederen registrere direkte.
2. Fravær vises i vagtplanen. Planlagte vagter i fraværsperioden markeres som udækkede, og lederen får besked.
3. Ferie som posteringer: månedlig optjening (job), afholdelse, overførsel og udbetaling. Ferieår og afholdelsesperiode gælder (1/9–31/8 og 1/9–31/12 året efter). Der gives en advarsel, hvis hovedferien (15 sammenhængende dage 1/5–30/9) ikke er planlagt.
4. Saldi for ferie og feriefridage, omsorgsdage m.v. til medarbejderen og lederen.
5. Rådighedsvagter i vagtplanen og registrering af tilkald i tidsregistreringen. Både rådighed og tilkald valideres mod hviletid.

Status (bygget 2026-11-14):

- `/fravaer` (medarbejder): saldi pr. konto og periode, ansøgning og egne ansøgninger med annullering, og en advarsel hvis hovedferien ikke er planlagt.
- `/fravaer/godkend` (leder eller personlig godkender): godkend eller afvis, registrér fravær direkte (fx sygdom), annullér godkendt fravær, holdets saldi og manuelle posteringer.
- Vagtplanen viser fravær. Vagter i godkendt fravær markeres "Udækket", og oversigten viser ansøgninger, der venter, og udækkede vagter de næste 14 dage.
- Tilkald registreres som tid af typen "Tilkald under rådighed" og valideres som arbejde mod hviletid. Rådighed regnes som hvile (jura-todo nr. 20).
- Ikke med: e-mail om fravær, delvise fraværsdage, og fravær, der ændres efter godkendelse (annullér og søg igen).

Acceptkriterier:

- Ferie- og fraværssaldi beregnes altid som summen af posteringer. En rettelse er en ny postering.
- Tests for ferieårets skift, ansættelse og fratræden midt i en måned, og en ung der fylder 18 under en fraværsperiode.
- Et tilkald under rådighed giver minimumsbetaling efter overenskomsten (golden test).
- Playwright: medarbejderen søger om ferie, lederen godkender, og saldoen og vagtplanen opdateres.

### Fase 6 – Løn, eksport og overenskomst-admin

Opgaver:

1. Lønperioder genereres fra lønperiode-grupperne (uge, 14 dage, måned). Afslutning af en periode låser den.
2. `calculatePay` pr. medarbejder og periode, inkl. fravær, ferie og rådighed, så lønlinjer gemmes med forklaring. En lukket periode genberegnes aldrig.
3. Lønlinjevisning: "Hvorfor?" viser regel, kilde og interval.
4. Eksport-adapter-interface + generisk CSV-adapter + `pay_code_mapping`.
5. Admin-UI til overenskomster: versioner, arv, formular pr. primitiv (plus JSON-visning), validering, publicering af en ny version.
6. Simulator: vælg en testuge, og se lønlinjer og overtrædelser **før og efter** ændringen side om side.
7. Gemte testuger pr. overenskomst med forventet resultat regnet i hånden. De køres mod den publicerede version og kladden, og publicering advarer, hvis en testuge fejler mod kladden.
8. Egne anmærkninger på overenskomsten (betingelse, grænse, virkning Info/Advarsel/Blokerende, vises i vagtplanen og/eller Godkend tid).

Beslutning 2026-11-14: Eksportfilen konfigureres af konsulenten, så den passer til lønsystemet. Kolonner, format og lønarter vælges selv, og beløb er en valgfri kolonne. Skabeloner til ProLøn og Lessor kommer, når importspecifikationen foreligger.

Status (bygget 2026-11-14):

- `/lon`: perioder pr. gruppe, "Beregn alle", lønlinjer med "Hvorfor?", "Afslut periode" og eksport med en valgt skabelon.
- `/lon/skabeloner`: skabelon-editor med forhåndsvisning (start: generisk CSV).
- `/indstillinger/overenskomster/[id]`: versioner, kopi/lokalaftale, formular og JSON, validering, publicering og simulator.
- Afslutning og eksport kræver `payroll.manage`. Som standard har kun administratorer den. Besluttet 2026-11-15: Det styres af rettighedsprofilerne, så konsulenten giver fx profilen Leder rettigheden under Rettighedsprofiler.
- Skabeloner til ProLøn og Lessor venter (besluttet 2026-11-15). Indtil da bygges formatet i skabelon-editoren.
- Ikke med: alle golden-uger kørt gennem UI'en (kun en lønlinje i e2e) og automatisk generering af alle perioder bagud i tid.

Acceptkriterier:

- Golden-ugerne giver de samme lønlinjer gennem UI'en som i motor-testene.
- At genberegne en lukket periode er umuligt. En ny overenskomstversion påvirker kun datoer fra dens `valid_from`.
- CSV-eksporten er deterministisk og testet. En ny adapter kræver kun en ny fil.
- Playwright: admin ændrer aftentillægget, ser forskellen i simulatoren og publicerer. Admin gemmer en testuge, som består mod den publicerede version, følger med kopien og fejler mod en kladde med højere aftentillæg. Lederen afslutter perioden og eksporterer.

## 5. Arbejdsform

- Små commits på engelsk. Tests, lint og typecheck køres før hver commit.
- TDD for alt i regelmotoren.
- Arbejdsgren: `claude/happy-lamport-nch8z6`. Der oprettes kun en PR, når du beder om det.
- UI-tekst er på dansk. Kode og commits er på engelsk.

## 6. Juridiske åbne punkter (`docs/jura-todo.md`)

Disse er **udeladt** efter aftale. De implementeres ikke, og UI'en viser, at de ikke kontrolleres:

- maks. ugentlige timer for unge under 15 eller undervisningspligtige
- tidsrum for nat- og alenearbejde for unge
- pausens længde i `basis-dk`. Loven kræver kun en pause, så `basis-dk` giver en advarsel, hvis der slet ingen pause er. Længden kommer fra overenskomsten.
- ferielovens satser (ferietillæg for ansatte med ferie med løn og feriegodtgørelse for andre) og reglerne for sygeløn/sygedagpenge. Satserne sættes ind i `basis-dk`, når du har bekræftet dem. Indtil da er de pladsholdere med `TODO(jura)`.

Alle satser i `eksempel-detail` er fiktive og markeret `// TODO(jura)`.

## 7. Uden for scope

Automatisk vagtlægning (Timefold), konkrete lønsystem-adaptere (Danløn, DataLøn m.fl.), native apps, geofence og kiosk, hostet Supabase, refusion af sygedagpenge, digital indberetning til Feriepengeinfo.
