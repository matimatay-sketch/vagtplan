import { exportSettingsSchema } from "@/lib/domain/export";
import type { ExportTemplateOption } from "@/components/payroll/export-dialog";

/** Template rows → choices for the export dialog (content and absence unit from the settings). */
export function templateOptions(
  rows: { id: string; name: string; settings: unknown }[] | null,
): ExportTemplateOption[] {
  return (rows ?? []).map((r) => {
    const s = exportSettingsSchema.safeParse(r.settings);
    return {
      id: r.id,
      name: r.name,
      content: s.success ? s.data.content : "pay",
      absenceUnit: s.success ? s.data.absenceUnit : "hours",
    };
  });
}
