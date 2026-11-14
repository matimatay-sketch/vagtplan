# Datamodel (fase 1)

Alle tider gemmes i UTC. Kalenderdatoer (`date`) tolkes i organisationens tidszone (`Europe/Copenhagen`).

```
organization ─┬─ membership (user ↔ rettighedsprofil)
              ├─ department ─── department_manager (user)
              ├─ employee ───── employee_department (n:m, én primær)
              │      └───────── contract ──► agreement (+ local agreement) ──► agreement_version (jsonb-dokument)
              ├─ pay_period_group (uge | 14 dage | måned)
              └─ audit_log (append-only, skrives af trigger)
```

| Tabel                 | Nøglefelter                                                                                                                                                                                            | Bemærkning                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `organization`        | `name`, `timezone`                                                                                                                                                                                     | Oprettes via RPC `create_organization`, som gør brugeren til admin og laver en standard-lønperiode |
| `membership`          | `organization_id`, `user_id`, `profile_id`                                                                                                                                                             | Den sidste administrator (ejer-profil) kan ikke flyttes eller fjernes                              |
| `department`          | `name`, `archived_at`                                                                                                                                                                                  | Navnet er unikt pr. organisation blandt aktive afdelinger                                          |
| `department_manager`  | `department_id`, `user_id`                                                                                                                                                                             | Brugeren er ansvarlig for afdelingen (afgrænser omfanget "egne afdelinger")                        |
| `employee`            | `employee_number`, `birth_date`, `school_obligated`, `school_obligation_ends_on`, `user_id`                                                                                                            | Intet CPR. Medarbejdernummeret er eksportnøgle                                                     |
| `employee_department` | `employee_id`, `department_id`, `is_primary`                                                                                                                                                           | Højst én primær afdeling                                                                           |
| `agreement`           | `key`, `kind` (base/agreement/local), `is_example`, `organization_id` (null = systemskabelon)                                                                                                          |                                                                                                    |
| `agreement_version`   | `version`, `valid_from`/`valid_to`, `status`, `document`                                                                                                                                               | Publicerede versioner må ikke overlappe. Kun kladder kan redigeres                                 |
| `pay_period_group`    | `frequency`, `anchor_date` (mandag) / `month_start_day` (1–28)                                                                                                                                         | Understøtter forskudte månedsperioder (fx 21.–20.)                                                 |
| `contract`            | `agreement_id`, `local_agreement_id`, `overrides` (kontraktlag), `pay_form`, `weekly_norm_minutes`, `pay_period_group_id`, `exempt_from_registration` (+ begrundelse og dato), `valid_from`/`valid_to` | Exclusion-constraint: ingen overlap pr. medarbejder. Skift midt i en periode er to kontrakter      |
| `audit_log`           | `actor_id`, `table_name`, `row_id`, `action`, `before`, `after`                                                                                                                                        | Kun admin kan læse. Ingen kan ændre eller slette                                                   |

## Integritet

- Sammensatte FK'er `(organization_id, id)` sikrer, at koblinger aldrig krydser organisationer.
- `organization_id` kan ikke ændres (trigger).
- En kontrakts overenskomst skal være en systemskabelon eller tilhøre samme organisation. En lokalaftale skal være af typen `local` i samme organisation (trigger).

## Rettighedsprofiler

```
permission (katalog: nøgle + tilladte omfang)
permission_profile (pr. organisation; én låst ejer-profil)
  └─ permission_grant (profil × rettighed → omfang: departments | organization)
membership ──► permission_profile
department_manager = "ansvarlig for afdeling" – afgrænser omfanget "departments"
organization.default_profile_id = profil ved invitation
```

| Rettighed                             | Omfang   | Giver                                                                                                 |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `employees.view`                      | afd./org | se medarbejdere                                                                                       |
| `employees.manage`                    | afd./org | oprette og redigere medarbejdere og deres afdelinger                                                  |
| `employees.invite`                    | afd./org | invitere til login (med standardprofilen)                                                             |
| `contracts.view` / `contracts.manage` | afd./org | se / oprette og afslutte kontrakter                                                                   |
| `departments.manage`                  | org      | afdelinger                                                                                            |
| `users.manage`                        | org      | profiler, en brugers profil og ansvarsafdelinger (på medarbejdersiden), valg af profil ved invitation |
| `settings.manage`                     | org      | lønperioder, standardprofil                                                                           |
| `agreements.manage`                   | org      | overenskomster                                                                                        |
| `audit.view`                          | org      | audit-log                                                                                             |

Alle kan altid se deres egne stamdata og kontrakter. Ejer-profilen kan ikke ændres eller arkiveres, og den sidste bruger med ejer-profilen kan ikke flyttes eller fjernes.

Helpers (security definer): `private.permission_scope(org, perm)`, `private.can_on_department(perm, dept)` og `private.can_on_employee(perm, emp)`. Til appen: `public.my_permissions(org)`, `public.can_on_employee(perm, emp)`, `public.organization_members(org)` og `public.set_profile_grants(profile, jsonb)` (atomisk, kører med kalderens RLS).

Testet i `supabase/tests/*.sql` (pgTAP).

## Vagtplan (fase 3)

| Tabel                  | Nøglefelter                                                                                                                                                               | Bemærkning                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shift`                | `department_id`, `employee_id` (null = ledig vagt), `start_at`/`end_at`, `break_minutes`, `kind` (work/on_call), `label`, `status`, `published` (snapshot), `archived_at` | Ledernes arbejdskopi. Ændres en offentliggjort vagt, bliver den til kladde igen, mens medarbejderne fortsat ser snapshottet. En fjernet vagt (`archived_at`) forsvinder for medarbejderne ved næste offentliggørelse |
| `shift_template`       | `name`, `start_time`/`end_time`, `break_minutes`, `kind`, `label`, `department_id` (null = alle)                                                                          |                                                                                                                                                                                                                      |
| `availability`         | `employee_id`, `date`, `kind` (unavailable/available/wish_off/wish_work), `from_time`/`to_time` (null = hele dagen)                                                       | Medarbejderen ejer sine egne rækker                                                                                                                                                                                  |
| `schedule_publication` | `department_id`, `from_date`/`to_date`, `published_by`, antal blokerende/advarsler                                                                                        |                                                                                                                                                                                                                      |
| `rule_violation`       | `publication_id`, `shift_id`, `employee_id`, `rule_id`, `code`, `severity`, `message`, `details`, `override_reason`, `overridden_by`                                      | Blokerende rækker kræver en begrundelse (CHECK)                                                                                                                                                                      |

Rettigheder: `schedule.view`, `schedule.manage`, `schedule.publish` og `schedule.override` (afdelinger eller hele virksomheden). Implikationerne kædes: tilsidesæt → offentliggør → se.

- **Offentliggørelse** sker kun via `publish_schedule()`, som kun service-rollen må kalde. Server-actionen validerer først ugen med regelmotoren og tjekker rettigheder. Funktionen tjekker igen aktørens rettigheder (som aktøren), kræver begrundelser og registrerer aktøren i audit-loggen.
- **Medarbejdere** læser vagtplanen via `published_shifts(from, to)`: snapshots af egne vagter og af vagter i egne afdelinger. De har ikke adgang til arbejdskopien.
- **Validering** bruger `shifts_for_validation(employee_ids, from, to)`, som henter medarbejderens vagter i alle afdelinger, så hviletid og gennemsnit regnes på hele arbejdsbyrden.
- **Realtime** er slået til på `shift` og `availability` og filtreres af RLS.

## Fase 3b

| Tabel / felt                                                      | Bemærkning                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization_settings`                                           | `notice_publish_hours`, `notice_change_hours` (bliver til et organisationslag med reglen `varsling` i regelmotoren), `rule_handling` (`{kode: "block" \| "allow"}`). Kræver `settings.manage` |
| `shift.breaks`, `shift_template.breaks`, `rotation_slot.breaks`   | JSON-liste: `{start_at \| start_time, minutes, paid}`. Summen skal være kortere end vagten (CHECK)                                                                                            |
| `supplement_type`                                                 | `name`, `pay_code`, `amount_type` (per_hour/fixed/percent), `amount` (øre eller basispoint)                                                                                                   |
| `supplement_type_ids`                                             | på `shift`, `shift_template`, `rotation_slot`. Valideres mod organisationen (trigger)                                                                                                         |
| `rotation` / `rotation_line` / `rotation_slot`                    | Ugeskabelon = turnus med 1 uge. Linjer og vagter er skabelonkonfiguration og må slettes (auditeres)                                                                                           |
| `rotation_rollout` + `shift.rollout_id`, `shift.rotation_slot_id` | En udrulning (start-mandag, uger, linje → medarbejder og startuge). "Udrul igen" erstatter kun vagter, der aldrig er offentliggjort                                                           |

Ved offentliggørelse gemmes regelbrud, som opsætningen tilsidesætter permanent, med begrundelsen "Tilsidesat permanent i opsætningen" og `details.auto_override = true`. De kræver ikke rettigheden `schedule.override`.

## Projekter

| Tabel / felt                                            | Bemærkning                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project`                                               | `number` (unik pr. organisation blandt aktive, uden forskel på store og små bogstaver), `name`, `customer`, `archived_at`                                                                    |
| `project_department`                                    | Afgrænsning til afdelinger. Ingen rækker betyder alle afdelinger. Det er koblingsrækker (konfiguration), som må slettes, og de auditeres                                                     |
| `shift.project_allocations`                             | JSON-liste: `{project_id, start_at, end_at, minutes}`. En række er et tidsrum, et antal minutter eller "resten af vagten". Trigger: projektet skal findes og være tilladt i vagtens afdeling |
| `shift_template.project_id`, `rotation_slot.project_id` | Standardprojekt for hele vagten                                                                                                                                                              |

Rettigheder: `projects.manage` (organisation) og `projects.view` (afdelinger eller organisation). Oversigten læser via `project_shifts(from, to)`, som kun returnerer vagter i afdelinger, hvor kalderen har `projects.view`. Funktionen returnerer navne og numre, fordi `projects.view` ikke forudsætter `employees.view`. Ændres projektfordelingen på en offentliggjort vagt, bliver vagten til en kladde igen, og fordelingen kommer med i snapshottet.

## Platform (kunder)

| Tabel / felt               | Bemærkning                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_admin`           | `user_id`. Platformsniveau (ingen `organization_id`). Vedligeholdes med SQL af driften. Der er ingen UI                                                       |
| `organization.archived_at` | En arkiveret kunde: medlemmerne mister adgangen (`is_member`, `permission_scope` og `my_permissions` ser bort fra den). Kun platformen kan arkivere (trigger) |

Selvbetjening er fjernet (`create_organization` findes ikke længere). Platform-RPC'erne kræver `is_platform_admin()`: `platform_organizations()`, `platform_create_organization(name)`, `platform_user_id(email)`, `platform_add_owner(org, user)` og `platform_set_archived(org, bool)`. Ukendte e-mails inviteres via service-klienten, efter at databasen har bekræftet platformsrettigheden. Platformsbrugeren kan ikke se kundernes data.

## Tidsregistrering (fase 4)

| Tabel / felt | Bemærkning                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `time_entry` | `employee_id`, `department_id`, `shift_id` (planlagt vagt), `start_at`/`end_at` (null = stemplet ind), `breaks`, `project_allocations`, `source` (stamp/planned/manual), `status` (open/pending/approved), `deviation_reason`, `note`, `offline` |
| Versioner    | Godkendte rækker kan ikke ændres (trigger). En rettelse er en ny række med `supersedes_id`, og den gamle får `superseded_at`. "Gældende" = ikke erstattet og ikke arkiveret                                                                      |
| Idempotens   | `client_id` (stempl ind) og `end_client_id` (stempl ud) er unikke pr. organisation. Offline-køen kan sendes igen uden dubletter                                                                                                                  |
| Overlap      | Exclusion-constraint: gældende registreringer for samme medarbejder overlapper ikke (en åben løber til den stemples ud)                                                                                                                          |

Rettigheder: `time.view`, `time.manage` (registrere og rette for andre) og `time.approve`, alle med omfanget afdelinger eller hele virksomheden. Medarbejderen ser og retter altid sin egen tid, indtil den er godkendt. En leder med afdelingsomfang kan ikke godkende sin egen tid.

RPC'er:

- `stamp(org, client_id, 'in'|'out', at)` knytter en ind-stempling til den nærmeste offentliggjorte vagt inden for 4 timer og arver pauser og projekter. Enhedstid accepteres op til 7 dage tilbage og markeres `offline`, hvis den afviger mere end 5 minutter fra serverens ur.
- `complete_as_planned(shift_ids)`
- `approve_time_entries(ids)`
- `correct_time_entry(...)` laver en ny version, der skal godkendes igen.
- `time_overview(from, to)` returnerer registreringer med plan og manglende registreringer.
- `time_entry_history(id)`
- `project_time_entries(from, to)`

### Godkendes af

`employee.approver_user_id` er en bruger, der ser og godkender netop denne medarbejders tid, uanset rettighedsprofil. Den bruges fx til lederens egen leder. Den kræver `users.manage` for at blive sat og må ikke være medarbejderen selv. Den udvider `time_entry_select`, `approve_time_entries`, `time_overview` og `time_entry_history`. `time_approvees(org)` returnerer de medarbejdere, brugeren godkender personligt.

`private.has_org_permission` returnerer altid `true` eller `false`. Før 2026-11-14 kunne den returnere NULL, så `organization_members()` ikke afviste brugere uden `users.manage`.

## Fravær og ferie (fase 5)

| Tabel / felt      | Bemærkning                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `absence`         | `employee_id`, `type_code` (`vacation`, `extra` eller en fraværstype fra overenskomsten), `from_date`/`to_date`, `status` (requested/approved/rejected/cancelled), `note`, `decision_note`, `days_hundredths`. Exclusion-constraint: søgt og godkendt fravær overlapper ikke. Ændres kun via RPC |
| `leave_posting`   | Kun indsættelse (trigger forbyder ændring og sletning). `account`, `kind` (accrual/usage/reversal/transfer/payout/adjustment), `period_start`/`usable_until`, `hundredths` (dage × 100), `absence_id`                                                                                            |
| `time_entry.kind` | `time_entry_kind`: work, on_call, call_out (tilkald). Vagter beholder `shift_kind` (work/on_call)                                                                                                                                                                                                |

Saldoen er altid summen af posteringer. Optjening beregnes af regelmotoren (`leaveAccruals`) og bogføres via `post_leave_accruals`, som kun service-rollen kan kalde. Det sker, efter at databasen har bekræftet brugerens adgang. Det er idempotent, fordi en optjening er unik pr. medarbejder, konto, periode og dato.

Ved godkendelse beregner appen feriedagene: mandag–fredag uden helligdage. Dagene trækkes fra de perioder, der udløber først, og `decide_absence` bogfører forbruget. Ved annullering af godkendt fravær modposterer `cancel_absence`. Overførsel, udbetaling og rettelse bogføres med `add_leave_posting` og kræver en begrundelse.

Rettigheder: `absence.view`, `absence.manage` og `absence.approve`. "Godkendes af" på medarbejderen gælder også fravær. Planlæggere (`schedule.view`/`schedule.manage`) ser fravær, men ikke saldi.

## Løn og eksport (fase 6)

| Tabel             | Bemærkning                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pay_period`      | Pr. lønperiode-gruppe (`start_date`/`end_date`, `status` open/closed). Oprettes automatisk omkring dags dato (`payroll.manage`). Afsluttes kun via `close_pay_period`                                                                            |
| `pay_run`         | Én beregning af én medarbejder i én periode (`engine_version`, `notes`, `daily_minutes`, `pending_entries`). En ny beregning erstatter den forrige (`superseded_at`). En afsluttet periode kan ikke beregnes igen. Skrives kun af `save_pay_run` |
| `pay_line`        | Lønlinjer: `pay_code`, `unit`, `quantity_minutes`, `rate_ore`, `amount_ore` og `explanation` (regel, kilde, lag og tidsrum til "Hvorfor?"). Kan ikke ændres                                                                                      |
| `export_template` | Konsulentens eksportskabelon: skilletegn, decimaltegn, overskrift, BOM, linjeskift, datoformat, rækker pr. lønart eller pr. linje, kolonner og oversættelse af lønarter (`src/lib/domain/export.ts`)                                             |
| `export_log`      | Hver eksport: periode, skabelon, antal rækker og SHA-256 af filen                                                                                                                                                                                |

Rettigheder: `payroll.view` (afdelinger eller organisation, Leder i egne afdelinger) og `payroll.manage` (organisation: beregne, afslutte, eksportere og vedligeholde skabeloner). Medarbejderen ser sine egne lønlinjer. Lønnen beregnes ud fra godkendt tid, den offentliggjorte plan bag tiden (til afrunding, garantier og vagttillæg) og godkendt fravær. Tid, der afventer godkendelse, tælles og vises som en advarsel. Ferietillæg, feriegodtgørelse og sygeløn beregnes i lønsystemet.

## Administration af overenskomster (fase 6)

- Systemskabeloner (`organization_id` null) kan ikke ændres. Kunden laver en egen kopi (ny nøgle `<nøgle>-egen`) eller en lokalaftale, der arver.
- Egne overenskomster: "Ny version fra dato" kopierer den seneste version som kladde. Kladden redigeres med en formular pr. regel eller som JSON, valideres med skemaet og ved opløsning mod det, den arver (advarsler under lovens minimum), og publiceres med `publish_agreement_version`. Den forrige version slutter dagen før, og publicerede versioner kan ikke ændres (trigger).
- Simulator: en medarbejder og en uge (godkendt tid, ellers vagtplanen) beregnes før og efter side om side. Kladden bruges, som om medarbejderen var på den (`simulateWeek` med `assign`).
