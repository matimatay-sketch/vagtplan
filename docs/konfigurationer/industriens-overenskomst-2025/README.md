# Industriens Overenskomst 2025–2028 – opsætning i Turnus

Industriens Overenskomst (CO-industri og DI, udgave 31/7-2025) for timelønnede. Den er sat op som data, der arver lovens minimum (`basis-dk`). Fem nye generelle byggeklodser i regelmotoren var nødvendige (se nederst).

- **Filer:** `v1.json` (satser fra 1/5-2025), `v2.json` (1/3-2026) og `v3.json` (1/3-2027). Alle tre laves af `generate.mjs`, så regler og satser ikke kan komme ud af trit. Kør `node docs/konfigurationer/industriens-overenskomst-2025/generate.mjs` og derefter `pnpm exec prettier --write docs/konfigurationer` efter en ændring.
- **Sådan lægges den ind:**
  1. Opret overenskomsten under **Indstillinger → Overenskomster → Ny overenskomst**, og indsæt `v1.json` på fanen **JSON**.
  2. Publicér version 1.
  3. Lav en ny version, indsæt `v2.json`, og publicér den.
  4. Gør det samme med `v3.json`. En ny version afslutter selv den forrige.
- **Personalegrupper** (feltet på kontrakten): `Dagarbejde`, `Forskudt tid`, `Skiftehold` og `Weekend`.
- **Ugenorm** (på kontrakten):
  - 37 timer;
  - 34 timer på 2. og 3. skift med faste uger;
  - 35, 35,5 eller 34 timer i turnus og skifteholdsplan (§ 15 stk. 4.1).
- **Løn:** Overenskomstens mindstebetaling er sat op for voksne og under 18 år. Den enkeltes løn aftales lokalt (§ 22 stk. 2) og indtastes på kontrakten eller i en lokalaftale.
- **Anciennitetsdato:** sættes på kontrakten, når tidligere ansættelse skal tælle med. Ellers tælles anciennitet fra første kontrakt.

## Regler

| Overenskomsten                                                                           | Regel i Turnus                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| § 18 stk. 1 1. maj, grundlovsdag og juleaftensdag                                        | Helligdage. Grundlovsdag er helligdag fra kl. 12                                                                                                                                            |
| § 22 stk. 1 Mindstebetaling                                                              | Lønsats `TIMELOEN` (voksne og under 18 år)                                                                                                                                                  |
| § 9 stk. 1 37 timer, nedsat med 1/5 for helligdage på hverdage                           | Normtid med `holiday_reduction`                                                                                                                                                             |
| § 13 stk. 7 Overarbejde efter normal arbejdstid: 1.–2., 3.–4., 5. klokketime og derefter | Overarbejde uden for den planlagte vagt. Trin i klokketimer efter vagtens slut (`OT_1_2`, `OT_3_4`, `OT_5`), også når overarbejdet begynder senere                                          |
| § 13 stk. 7 Overarbejde før normal arbejdstid (06–18 / 18–06)                            | Satser i tidsrum "før vagten" (`OT_FOER_DAG`, `OT_FOER_NAT`)                                                                                                                                |
| § 13 stk. 7 Arbejde på en tilsikret hverdagsfridag (06–18 / 18–06)                       | Satser i tidsrum "på dage uden vagt" (`OT_FRIDAG_DAG`, `OT_FRIDAG_NAT`)                                                                                                                     |
| § 13 stk. 7 Søn- og helligdage (til kl. 12 / efter kl. 12 og om morgenen)                | Satser i tidsrum (`OT_SOEN_FM`, `OT_SOEN_EM`). Normal arbejdstids begyndelse er sat til kl. 06                                                                                              |
| § 13 stk. 8 Afspadsering                                                                 | Betaling "Tillæg udbetales, og timerne afspadseres": tillægget udbetales, og overarbejdstimerne bliver til afspadsering (`AFSPADSERING`, uden beløb)                                        |
| § 14 stk. 6 Forskudt tid, tillæg 1, 2 og 3                                               | Tillæg for `Forskudt tid`: hverdage 18–22, 22–06, og 00–06 for vagter begyndt kl. 24 eller senere (tillæg 3 erstatter tillæg 2)                                                             |
| § 15 stk. 6 Skiftehold, tillæg 1 og 2                                                    | Tillæg for `Skiftehold`: hverdage 18–06, samt lørdag fra 14 til mandag kl. 06 og helligdage (det højeste gælder)                                                                            |
| § 10 stk. 5 Weekendarbejde betales med tillæg efter § 13 stk. 7 nr. 2 b og c             | Tillæg for `Weekend`: lørdag 06–18 og 18–06, søn- og helligdag til kl. 12 og derefter                                                                                                       |
| § 9 stk. 1 Dagarbejde mellem 06 og 18, mindst 6 timer pr. dag ved 5-dages uge            | Anmærkninger for `Dagarbejde` i vagtplanen                                                                                                                                                  |
| § 14 stk. 5, § 15 stk. 5.3 og 8.1 5 × 24 timers varsel                                   | Varsling af ændringer: 120 timer for forskudt tid og skiftehold                                                                                                                             |
| § 29 Sygdom og tilskadekomst                                                             | Fraværstyperne Sygdom (løn fra 6 måneders anciennitet) og Tilskadekomst (altid løn)                                                                                                         |
| § 30 Barns sygdom, hospitalsindlæggelse, omsorgsdage, ledsagelse                         | Barns 1. sygedag (løn fra 9 måneder), barns 2. og 3. sygedag, hospitalsindlæggelse (5 dage), børneomsorgsdage, børnebørns-omsorgsdage og ledsagelse (2 dage hver efter 9 måneder, uden løn) |
| § 33 Seniorordning, § 32 Begravelse                                                      | Fraværstyperne Seniorfridag og Begravelse (uden løn)                                                                                                                                        |
| § 18 stk. 2 Feriefridage                                                                 | 5 feriefridage pr. ferieår (1/9) efter 9 måneders anciennitet, også i et ferieår, hvor de 9 måneder nås før 31/8                                                                            |
| § 40 stk. 6 Overførsel af ferie ud over 20 dage                                          | Ferie: overførsel kun af dage ud over 20                                                                                                                                                    |

## Tillæg pr. gang (sættes op som tillægstyper under Opsætning)

Disse tillæg afhænger af noget, Turnus ikke kan se af vagterne. De oprettes som tillægstyper med fast beløb og vælges på vagten eller registreringen.

| Tillæg                                                                 | 1/5-2025 | 1/3-2026 | 1/3-2027 |
| ---------------------------------------------------------------------- | -------- | -------- | -------- |
| § 13 stk. 5 Overarbejde over 1 time ikke varslet dagen før             | 119,10   | 122,70   | 126,35   |
| § 13 stk. 7 nr. 2 d Spisepause udskudt over ½ time                     | 33,05    | 34,05    | 35,10    |
| § 15 stk. 8.4 Skiftehold, tillæg 5 (akut overflytning)                 | 261,20   | 270,30   | 279,80   |
| § 15 stk. 6.6 Skiftehold, tillæg 3 pr. time (ingen erstatningsfridag)  | 104,70   | 108,35   | 112,15   |
| § 15 stk. 8.5 Skiftehold, tillæg 4 pr. time (forskudt vagtlistefridag) | 32,80    | 33,95    | 35,15    |
| § 19 stk. 2 Udearbejde pr. time                                        | 6,20     | 6,45     | 6,65     |

Forgæves fremmøde (§ 27) er 4 timers løn og registreres som en manuel løntimelinje.

## Uden for Turnus

Fritvalgs Lønkonto (§ 25), pension (§ 34), feriegodtgørelse og -tillæg (§ 40) og sygeløn efter 5 uger beregnes af lønsystemet ud fra lønlinjerne. Akkord (§ 24) og supplerende lønsystemer (§ 23) aftales lokalt.

## Testuger (regnet i hånden, satser fra 1/3-2026)

Testugerne køres automatisk i `packages/agreements/test/konfigurationer.test.ts`.

| Testuge                                     | Forventet                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Dagarbejde: vagt 07–15, arbejdet 07–18      | Timeløn 11 t, overarbejde 2 t × 48,10 + 1 t × 76,80, afspadsering 3 t  |
| Dagarbejde: søndag 08–14 uden vagt          | Timeløn 6 t, søndag 4 t × 95,75 + 2 t × 143,70, afspadsering 6 t       |
| Grundlovsdag 2026 (fredag) 10–14 uden vagt  | Hverdagsfridag 2 t × 76,80, efter kl. 12 2 t × 143,70                  |
| Forskudt tid: tirsdag 00–08 og onsdag 18–02 | Tillæg 3 6 t × 62,70, tillæg 1 4 t × 32,60, tillæg 2 4 t × 53,20       |
| Skiftehold: fredag 14–22 og lørdag 14–22    | Tillæg 1 4 t × 50,40, tillæg 2 8 t × 108,00                            |
| Weekend: lørdag 06–18                       | Weekendtillæg 12 t × 76,80                                             |
| Under 18 år: mandag 08–12                   | Timeløn 4 t × 82,60                                                    |
| Sygdom én dag                               | Med 6 måneders anciennitet: 7,4 t × 143,40. Uden: ingen løn og en note |

## Åbne punkter

Se `docs/jura-todo.md` nr. 35–40.
