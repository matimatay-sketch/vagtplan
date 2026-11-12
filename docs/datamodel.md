# Datamodel (fase 1)

Alle tider gemmes i UTC. Kalenderdatoer (`date`) tolkes i organisationens tidszone (`Europe/Copenhagen`).

```
organization ─┬─ membership (user ↔ rolle: admin | manager | employee)
              ├─ department ─── department_manager (user)
              ├─ employee ───── employee_department (n:m, én primær)
              │      └───────── contract ──► agreement (+ local agreement) ──► agreement_version (jsonb-dokument)
              ├─ pay_period_group (uge | 14 dage | måned)
              └─ audit_log (append-only, skrives af trigger)
```

| Tabel                 | Nøglefelter                                                                                                                                                                                            | Bemærkning                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `organization`        | `name`, `timezone`                                                                                                                                                                                     | Oprettes via RPC `create_organization`, som gør brugeren til admin og laver en standard-lønperiode |
| `membership`          | `organization_id`, `user_id`, `role`                                                                                                                                                                   | En admin kan ikke degradere eller slette sig selv                                                  |
| `department`          | `name`, `archived_at`                                                                                                                                                                                  | Navnet er unikt pr. organisation blandt aktive afdelinger                                          |
| `department_manager`  | `department_id`, `user_id`                                                                                                                                                                             | Giver kun ret, når brugeren også har rollen `manager`                                              |
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

## RLS-overblik

| Tabel               | admin                   | manager                                                          | employee           |
| ------------------- | ----------------------- | ---------------------------------------------------------------- | ------------------ |
| organization        | læs/ret                 | læs                                                              | læs                |
| department          | alt                     | læs                                                              | læs                |
| employee            | alt i org               | medarbejdere i egne afdelinger (opret via RPC `create_employee`) | kun sig selv (læs) |
| contract            | alt i org               | medarbejdere i egne afdelinger                                   | egne (læs)         |
| agreement(+version) | org's egne + skabeloner | læs                                                              | læs                |
| pay_period_group    | alt                     | læs                                                              | læs                |
| audit_log           | læs                     | –                                                                | –                  |

Testet i `supabase/tests/*.sql` (pgTAP).
