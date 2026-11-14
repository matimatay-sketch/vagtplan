/**
 * @vagtplan/rules-engine – pure TypeScript rules engine for Danish working
 * time, overtime, supplements and pay lines. No database, UI or network.
 */
export const ENGINE_VERSION = "1.0.0";

export * from "./agreement/schema";
export { resolveAgreement, versionOn, deepMerge, rulesOf } from "./agreement/resolve";
export type {
  AgreementRegistry,
  ResolvedAgreement,
  ResolvedRule,
  ResolutionWarning,
  LayerRef,
} from "./agreement/resolve";
export { buildHolidayCalendar, easterSunday, HOLIDAY_DEFINITIONS } from "./calendar/holidays";
export type { HolidayInfo } from "./calendar/holidays";
export { validateSchedule, validateNotice } from "./validate";
export type { NoticeInput, NoticeItem } from "./validate";
export { shiftsToIntervals } from "./shifts";
export type { PlannedShift, PlannedBreak } from "./shifts";
export type { Violation, ValidateInput, ValidationResult } from "./validate";
export { calculatePay, stack } from "./pay";
export type { CalcPayInput, PayLine, PayResult, PayNote, ExplainedInterval } from "./pay";
export { roundRegistrations, dailyWorkingMinutes } from "./registrations";
export type { RoundInput } from "./registrations";
export { simulateWeek } from "./simulate";
export type { SimulateInput, SimulationResult } from "./simulate";
export { vacationAccrual, yearStartContaining } from "./vacation";
export type { VacationEntry } from "./vacation";
export {
  leaveAccruals,
  leaveDays,
  leaveTypes,
  mainHolidayStatus,
  vacationMoveLimit,
} from "./vacation/ledger";
export type { LeavePosting } from "./vacation/ledger";
export { ageOn } from "./context";
export { formatMinutes } from "./format";
export * from "./model";
export {
  parseInstant,
  formatInstant,
  toLocal,
  wallTime,
  addDays,
  isoWeekStart,
  isoWeekday,
} from "./time/local-time";
export type { IsoDate, Instant } from "./time/local-time";
