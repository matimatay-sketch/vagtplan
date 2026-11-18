-- A shift may count more than its real time towards the norm (e.g. 150 %).
-- The upper limit only guards against typing errors.
alter table public.shift drop constraint shift_norm_percent_check,
  add constraint shift_norm_percent_check check (norm_percent between 0 and 1000);
alter table public.shift_template drop constraint shift_template_norm_percent_check,
  add constraint shift_template_norm_percent_check check (norm_percent between 0 and 1000);
alter table public.organization_settings
  drop constraint organization_settings_norm_percent_work_check,
  add constraint organization_settings_norm_percent_work_check check (norm_percent_work between 0 and 1000),
  drop constraint organization_settings_norm_percent_on_call_check,
  add constraint organization_settings_norm_percent_on_call_check check (norm_percent_on_call between 0 and 1000);
