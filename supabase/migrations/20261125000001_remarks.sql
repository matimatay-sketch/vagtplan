-- Remarks (anmærkninger): consultant-defined rules with severity INFO, WARNING
-- or BLOCKING. INFO violations are stored in the publication snapshot like
-- warnings and never need an override reason.
alter table public.rule_violation drop constraint if exists rule_violation_severity_check;
alter table public.rule_violation drop constraint if exists rule_violation_check;
alter table public.rule_violation
  add constraint rule_violation_severity_check check (severity in ('BLOCKING', 'WARNING', 'INFO')),
  add constraint rule_violation_check
    check (severity <> 'BLOCKING' or (override_reason is not null and length(trim(override_reason)) >= 5));
