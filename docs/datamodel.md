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
