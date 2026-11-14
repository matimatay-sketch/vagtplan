# Regelmotoren (`packages/rules-engine`)

Ren TypeScript. Ingen database, intet UI og intet netværk (håndhæves af ESLint). Alle tider ind og ud er UTC-instants. Døgn, ugedage og tidsvinduer beregnes i organisationens tidszone (`Europe/Copenhagen`) med `temporal-polyfill`.

## Offentlig API

| Funktion                                                                                 | Bruges til                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `resolveAgreement(registry, { agreementId, localAgreementId, contractOverrides, date })` | De regler der gælder for en kontrakt på en dato, med arv og advarsler             |
| `validateSchedule({ …input, intervals, absences, from, to })`                            | Overtrædelser (BLOKERENDE/ADVARSEL) for planlagt eller faktisk tid                |
| `calculatePay({ …input, worked, planned, absences, period })`                            | Lønlinjer med forklaring + samlet daglig arbejdstid                               |
| `simulateWeek({ …input, weekStart, worked, replace })`                                   | Før/efter-sammenligning når et overenskomstdokument ændres (simulatoren i fase 6) |
| `vacationAccrual(params, employment, upTo)`                                              | Ferieoptjening som posteringer (ledger)                                           |

`input` (`EngineInput`) indeholder tidszone, overenskomst-registret (alle versioner), medarbejderens fødselsdato og undervisningspligt, kontrakterne og eventuelle skoledage.

## Overenskomstdokumenter

Et dokument er et **lag**: `basis-dk` → overenskomst → lokalaftale → kontrakt (`contract.overrides`).

- Regler matches på `id`. Et lag kan tilføje en hel regel, ændre enkelte felter (objekter merges dybt, lister erstattes) eller fjerne en regel med `remove: true`.
- Den færdige regel valideres med primitivens Zod-skema. Fejl nævner regel-id og felt.
- Versionen vælges pr. dato (`valid_from` ≤ dato ≤ `valid_to`). Historik beregnes altid med den version, der gjaldt den dag.
- Hvis en værdi er ringere end `basis-dk` (fx kortere hviletid) eller en lovregel fjernes uden `legal_basis`, gives advarslerne `BELOW_LAW_MINIMUM` eller `LAW_RULE_REMOVED`.
- Ved `example: true` gives advarslen `EXAMPLE_AGREEMENT`. Eksempel-dokumenter må aldrig bruges til løn.
- `todo_jura` på en regel markerer, at værdien ikke er juridisk verificeret.

Enheder: penge i **øre**, procenter i **basispoint** (5000 = 50 %), varighed i **minutter** og klokkeslæt som lokalt `"HH:MM"` (`"24:00"` er tilladt som slut).

## Primitiver

| Primitiv                 | Dansk                                                                                                                                    | Bruges af       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `pay_rate`               | Lønsats (personalegruppe, trin, alder, datoer)                                                                                           | løn             |
| `norm`                   | Normtid (uge eller N uger, dagsnorm, deltidsgrænser)                                                                                     | overarbejde     |
| `overtime`               | Overarbejde (`daily_norm`, `weekly_norm`, `period_norm`, `outside_planned`, trin, udbetaling eller afspadsering)                         | løn             |
| `time_window_supplement` | Tidsvinduestillæg (ugedage, `weekday`, `holiday`, `any`, vinduer over midnat)                                                            | løn             |
| `holiday_calendar`       | Helligdagskalender (påskeberegnet, særdage, halve dage)                                                                                  | løn, unge       |
| `break`                  | Pause. `paid_counts_as_working_time` (standard `true`): betalte pauser tæller med i daglige/ugentlige grænser og 48-timers-gennemsnittet | validering      |
| `rest`                   | Hviletid og fridøgn                                                                                                                      | validering      |
| `max_weekly_average`     | 48 timer i gennemsnit over en referenceperiode (advarsel og grænse)                                                                      | validering      |
| `min_shift`              | Minimum vagtlængde og garantibetaling                                                                                                    | validering, løn |
| `night_work`             | Natarbejde (gennemsnit pr. døgn)                                                                                                         | validering      |
| `rounding`               | Afrunding og tolerance mod planlagt vagt                                                                                                 | løn             |
| `young_worker`           | Unge under 18 (grupper efter alder og undervisningspligt)                                                                                | validering      |
| `on_call`                | Rådighed og tilkald (minimumsbetaling)                                                                                                   | løn             |
| `absence`                | Fravær (typer, betaling, tæller med i normen, ret til dage)                                                                              | løn             |
| `vacation`               | Ferie og feriefridage                                                                                                                    | optjening       |

Planlagt til fase 3: `notice` (varsling) og `weekend_off` (weekendfri).

## Beregningspipeline (`calculatePay`)

1. **Afrund** stemplinger (snap til den planlagte vagt inden for tolerancen, ellers afrunding til enhed). Ubetalte pauser trækkes fra.
2. **Segmentér** ved lokal midnat, tillægsvinduernes grænser, halve helligdage og grænser for planlagte vagter.
3. **Overarbejde** findes pr. tælleenhed: dag, uge eller normperiode. Normen = kontraktens ugenorm / 7 pr. dag, så den fordeles korrekt ved kontraktskift midt i ugen. Fravær, der tæller med i normen, trækkes fra normen. Minutterne efter normen bliver overarbejde, og segmenter splittes ved norm- og trin-grænser. Har en medarbejder flere overarbejdsregler, behandles de i prioritetsorden, og et minut tælles kun én gang.
4. **Kandidater** pr. segment: overarbejdstrin og matchende tidsvinduestillæg.
5. **Stabling** sker i fire trin, i denne rækkefølge:
   1. `replaces` fjerner de navngivne regler.
   2. Den stærkeste `exclusive`-kandidat (prioritet, derefter sats) står alene.
   3. `highest` beholder den højeste kandidat pr. `group`.
   4. `additive` lægges altid til.
6. **Lønlinjer**: timeløn (kun timelønnede), tillæg, overarbejde, rådighed og tilkaldsgaranti, garanti for minimumsvagt og betalt fravær. For månedslønnede indeholder overarbejdslinjen timelønnen. Beløb = minutter × sats / 60, afrundet til hele øre pr. linje.
7. **Forklaring**: hver linje har regel-id, primitiv, kilde, det lag (overenskomst og version), der sidst ændrede reglen, og de konkrete tidsintervaller.

Kun segmenter med lokal dato i lønperioden giver linjer. Overarbejde kræver dog hele tælleenheden, så send hele uger eller normperioder med.

## Validering (`validateSchedule`)

| Kode                                                   | Regel                                                                                                                                                                                | Standardalvor                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `REST_DAILY`                                           | Under 11 t (unge: 12 eller 14 t) sammenhængende hvile i et 24-timers vindue. Vinduerne lægges ved hver vagts start og slut. Overtrædelsen registreres på den vagt, der bryder reglen | BLOKERENDE                               |
| `REST_WEEKLY`                                          | Intet hul på fridøgn + daglig hvile, der dækker mindst 24 t af ugen (eller løbende 7 døgn)                                                                                           | BLOKERENDE                               |
| `MAX_WEEKLY_AVERAGE`                                   | Gennemsnit i referenceperioden (fraværsdage er neutrale)                                                                                                                             | ADVARSEL over 44 t, BLOKERENDE over 48 t |
| `BREAK_MISSING`                                        | Arbejdsdag over 6 t uden pause (eller kortere end overenskomstens minimum)                                                                                                           | ADVARSEL                                 |
| `YOUNG_MAX_DAILY` / `YOUNG_MAX_WEEKLY` / `YOUNG_BREAK` | Unge (skoledage, fødselsdage midt i ugen)                                                                                                                                            | BLOKERENDE                               |
| `MIN_SHIFT`                                            | Vagt kortere end minimum                                                                                                                                                             | ADVARSEL                                 |
| `NIGHT_AVERAGE`                                        | Natarbejder over 8 t i gennemsnit pr. døgn                                                                                                                                           | ADVARSEL                                 |

Al tid er reel forløbet tid. En vagt hen over sommertid er derfor en time kortere eller længere end vægurets tid.

## Test

- `packages/rules-engine`: 100 enhedstests for grænseværdier, midnat, sommertid (marts og oktober), stabling i alle tilstande, fødselsdag midt i ugen, kontraktskift, unge og skoledage. Der er en minimumsgrænse for dækning (linjer 97 %, forgreninger 88 %).
- `packages/agreements/*/fixtures`: golden tests med testuger og forventede lønlinjer, dagstotaler og overtrædelser.
- `supabase/seeds/agreements.sql` genereres fra JSON-dokumenterne (`pnpm --filter @vagtplan/agreements seed`). En test fejler, hvis filen er forældet.

## Konfigurerbare valg (2026-11-14)

| Primitiv   | Parameter                                             | Standard            |
| ---------- | ----------------------------------------------------- | ------------------- |
| `absence`  | `entitlement_proration`: `none` / `remaining_months`  | `none`              |
| `on_call`  | `counts_as_rest`                                      | `true`              |
| `vacation` | `leave_day_basis`: `weekdays` / `planned_days`        | `weekdays`          |
| `vacation` | `transfer` / `payout`: `{ allowed, only_above_days }` | tilladt uden grænse |

Valgene sættes i overenskomsten eller af konsulenten på siden Opsætning. Siden gemmer dem i `organization_settings.leave_rules`, og de bliver til organisationslaget med `merge_into: "primitive"`. Det betyder, at de fletter parametrene ind i alle regler af den primitiv, uanset regel-id. Har overenskomsten ingen regel af den primitiv, oprettes der ingen. Reglen beholder sin egen kilde.
