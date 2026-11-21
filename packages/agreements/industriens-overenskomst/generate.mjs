// Generates the three versions of Industriens Overenskomst 2025–2028 (one per
// rate date) from one definition, so rules and rates cannot drift apart.
// Run: pnpm --filter @vagtplan/agreements generate:io  (then the seed and prettier)
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dirname;

/** Rates in øre from the agreement text, per rate date. */
const VERSIONS = [
  {
    version: 1,
    valid_from: "2025-05-01",
    valid_to: "2026-02-28",
    // § 22 stk. 1
    adult: 13990,
    youth: 8055,
    // § 13 stk. 7 nr. 2
    otA: 4670,
    otB: 7455,
    otC: 13950,
    otX: 9295,
    // § 14 stk. 6
    f1: 3150,
    f2: 5140,
    f3: 6060,
    // § 15 stk. 6.2
    s1: 4870,
    s2: 10435,
    // Paid per occasion or per hour when the situation arises (startpakke).
    s3: 10470,
    s4: 3280,
    s5: 26120,
    varsel: 11910,
    spise: 3305,
    ude: 620,
  },
  {
    version: 2,
    valid_from: "2026-03-01",
    valid_to: "2027-02-28",
    adult: 14340,
    youth: 8260,
    otA: 4810,
    otB: 7680,
    otC: 14370,
    otX: 9575,
    f1: 3260,
    f2: 5320,
    f3: 6270,
    s1: 5040,
    s2: 10800,
    s3: 10835,
    s4: 3395,
    s5: 27030,
    varsel: 12270,
    spise: 3405,
    ude: 645,
  },
  {
    version: 3,
    valid_from: "2027-03-01",
    valid_to: null,
    adult: 14690,
    youth: 8460,
    otA: 4955,
    otB: 7910,
    otC: 14800,
    otX: 9860,
    f1: 3375,
    f2: 5505,
    f3: 6490,
    s1: 5215,
    s2: 11175,
    s3: 11215,
    s4: 3515,
    s5: 27980,
    varsel: 12635,
    spise: 3510,
    ude: 665,
  },
];

const kr = (ore) => ({ type: "ore_per_hour", ore });
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];

function document(v) {
  return {
    id: "industriens-overenskomst",
    name: "Industriens Overenskomst 2025–2028",
    kind: "agreement",
    version: v.version,
    valid_from: v.valid_from,
    valid_to: v.valid_to,
    inherits_from: "basis-dk",
    source: "Industriens Overenskomst 2025–2028 (CO-industri og DI), udgave 31/7-2025",
    example: false,
    description:
      "Timelønnede under Industriens Overenskomst. Personalegrupper (feltet på kontrakten): Dagarbejde, Forskudt tid, Skiftehold og Weekend. Satserne er overenskomstens; den enkeltes løn aftales lokalt (§ 22 stk. 2) og sættes på kontrakten.",
    pay_codes: {
      TIMELOEN: { label: "Timeløn" },
      OT_1_2: { label: "Overarbejde 1.–2. klokketime" },
      OT_3_4: { label: "Overarbejde 3.–4. klokketime" },
      OT_5: { label: "Overarbejde 5. klokketime og derefter" },
      OT_FOER_DAG: { label: "Overarbejde før arbejdstid 06–18" },
      OT_FOER_NAT: { label: "Overarbejde før arbejdstid 18–06" },
      OT_FRIDAG_DAG: { label: "Overarbejde på hverdagsfridag 06–18" },
      OT_FRIDAG_NAT: { label: "Overarbejde på hverdagsfridag 18–06" },
      OT_SOEN_FM: { label: "Søn- og helligdag til kl. 12" },
      OT_SOEN_EM: { label: "Søn- og helligdag efter kl. 12 og om natten" },
      AFSPADSERING: { label: "Afspadsering (overarbejdstimer)" },
      FORSKUDT_1: { label: "Forskudt tid, tillæg 1 (18–22)" },
      FORSKUDT_2: { label: "Forskudt tid, tillæg 2 (22–06)" },
      FORSKUDT_3: { label: "Forskudt tid, tillæg 3 (påbegyndt kl. 24 eller senere)" },
      SKIFT_1: { label: "Skiftehold, tillæg 1 (hverdage 18–06)" },
      SKIFT_2: { label: "Skiftehold, tillæg 2 (weekend og helligdage)" },
      WEEKEND_LOER: { label: "Weekendarbejde lørdag 06–18" },
      WEEKEND_NAT: { label: "Weekendarbejde lørdag 18–06" },
      WEEKEND_SOEN_FM: { label: "Weekendarbejde søn- og helligdag til kl. 12" },
      WEEKEND_SOEN_EM: { label: "Weekendarbejde søn- og helligdag efter kl. 12" },
      SYG: { label: "Sygdom" },
      SYG_TILSKADE: { label: "Tilskadekomst" },
      BARN_SYG: { label: "Barns 1. sygedag" },
      BARN_HOSP: { label: "Barns hospitalsindlæggelse" },
    },
    rules: [
      {
        id: "helligdage",
        label: "Helligdage og overenskomstmæssige fridage",
        source: "§ 18 stk. 1 og § 13 stk. 7 nr. 1 b",
        todo_jura:
          "1. maj, grundlovsdag og juleaftensdag regnes efter overenskomsten fra kl. 06.00 (eller normal arbejdstids begyndelse) til næste dag. Turnus bruger kalenderdøgnet. Grundlovsdag er hverdagsfridag til kl. 12 og søn- og helligdag derefter.",
        params: {
          holidays: [
            "nytaarsdag",
            "skaertorsdag",
            "langfredag",
            "paaskedag",
            "anden_paaskedag",
            "kristi_himmelfartsdag",
            "pinsedag",
            "anden_pinsedag",
            "juledag",
            "anden_juledag",
            "foerste_maj",
            "grundlovsdag",
            "juleaftensdag",
          ],
          partial: [{ key: "grundlovsdag", from: "12:00" }],
        },
      },
      {
        id: "timeloen",
        primitive: "pay_rate",
        label: "Mindstebetaling",
        source: "§ 22 stk. 1",
        todo_jura:
          "Overenskomstens mindstebetaling. Den enkeltes løn aftales lokalt (§ 22 stk. 2) og indtastes som en sats på kontrakten eller i en lokalaftale. Lærlinge og elever (del 3) har egne satser.",
        params: {
          pay_code: "TIMELOEN",
          rates: [
            { min_age: 18, hourly_ore: v.adult },
            { max_age: 18, hourly_ore: v.youth },
          ],
        },
      },
      {
        id: "normtid",
        primitive: "norm",
        label: "37 timer, nedsat med 1/5 for helligdage på hverdage",
        source: "§ 9 stk. 1, § 11 stk. 2, § 15 stk. 4.1",
        todo_jura:
          "Ugenormen står på kontrakten: 37 timer (dag, forskudt, skiftehold 1. skift, weekend 37 timer svarende til 24), 34 timer på 2. og 3. skift, 35/35,5/34 timer i turnus. Varierende ugentlig arbejdstid over 12 måneder (§ 9 stk. 2) sættes op som normperiode i en lokalaftale.",
        params: { period: { type: "week" }, holiday_reduction: "one_fifth_on_weekdays" },
      },
      {
        id: "overarbejde",
        primitive: "overtime",
        label: "Overarbejde efter klokketimer og tidsrum",
        source: "§ 13 stk. 2, 7 og 8",
        todo_jura:
          "Normal arbejdstids begyndelse er sat til kl. 06.00 (tidsrummene på søn- og helligdage). Ret til virksomhedens tid. Afspadseringsfrit overarbejde (stk. 8 nr. 4: aftale med tillidsrepræsentanten, under 12 timer på 4 uger ved fuld tid, sygeafløsning m.m.) vurderes ikke automatisk: sæt betalingen til 'Tillæg udbetales' i en lokalaftale. Deltidsansattes overarbejde (stk. 7 nr. 1 d) beregnes som for fuldtid.",
        params: {
          trigger: "outside_planned",
          tier_basis: "since_planned_end",
          compensation: "payout_and_time_off",
          time_off_pay_code: "AFSPADSERING",
          tiers: [
            { up_to_minutes: 120, amount: kr(v.otA), pay_code: "OT_1_2" },
            { up_to_minutes: 120, amount: kr(v.otB), pay_code: "OT_3_4" },
            { up_to_minutes: null, amount: kr(v.otC), pay_code: "OT_5" },
          ],
          window_rates: [
            {
              days: ["sun", "holiday"],
              from: "06:00",
              to: "12:00",
              amount: kr(v.otX),
              pay_code: "OT_SOEN_FM",
            },
            {
              days: ["sun", "holiday"],
              from: "12:00",
              to: "06:00",
              amount: kr(v.otC),
              pay_code: "OT_SOEN_EM",
            },
            {
              days: ["sun", "holiday"],
              from: "00:00",
              to: "06:00",
              amount: kr(v.otC),
              pay_code: "OT_SOEN_EM",
            },
            {
              days: ["any"],
              from: "06:00",
              to: "18:00",
              when: "before_planned",
              amount: kr(v.otA),
              pay_code: "OT_FOER_DAG",
            },
            {
              days: ["any"],
              from: "18:00",
              to: "06:00",
              when: "before_planned",
              amount: kr(v.otC),
              pay_code: "OT_FOER_NAT",
            },
            {
              days: ["any"],
              from: "06:00",
              to: "18:00",
              when: "day_off",
              amount: kr(v.otB),
              pay_code: "OT_FRIDAG_DAG",
            },
            {
              days: ["any"],
              from: "18:00",
              to: "06:00",
              when: "day_off",
              amount: kr(v.otC),
              pay_code: "OT_FRIDAG_NAT",
            },
          ],
        },
      },
      {
        id: "forskudt-1",
        primitive: "time_window_supplement",
        label: "Forskudt tid, tillæg 1",
        source: "§ 14 stk. 6",
        applies_to: { staff_groups: ["Forskudt tid"] },
        params: {
          windows: [{ days: WEEKDAYS, from: "18:00", to: "22:00" }],
          amount: kr(v.f1),
          pay_code: "FORSKUDT_1",
        },
      },
      {
        id: "forskudt-2",
        primitive: "time_window_supplement",
        label: "Forskudt tid, tillæg 2",
        source: "§ 14 stk. 6",
        todo_jura:
          '"Hverdage" er sat til mandag–fredag (aftenen), så natten til lørdag er med, men natten til mandag ikke.',
        applies_to: { staff_groups: ["Forskudt tid"] },
        stacking: { mode: "highest", group: "forskudt-nat" },
        params: {
          windows: [{ days: WEEKDAYS, from: "22:00", to: "06:00" }],
          amount: kr(v.f2),
          pay_code: "FORSKUDT_2",
        },
      },
      {
        id: "forskudt-3",
        primitive: "time_window_supplement",
        label: "Forskudt tid, tillæg 3 (påbegyndt kl. 24 eller senere)",
        source: "§ 14 stk. 6",
        applies_to: { staff_groups: ["Forskudt tid"] },
        stacking: { mode: "highest", group: "forskudt-nat" },
        params: {
          windows: [
            {
              days: ["tue", "wed", "thu", "fri", "sat"],
              from: "00:00",
              to: "06:00",
              started_at_or_after: "00:00",
            },
          ],
          amount: kr(v.f3),
          pay_code: "FORSKUDT_3",
        },
      },
      {
        id: "skift-1",
        primitive: "time_window_supplement",
        label: "Skiftehold, tillæg 1",
        source: "§ 15 stk. 6.3",
        applies_to: { staff_groups: ["Skiftehold"] },
        stacking: { mode: "highest", group: "skift" },
        params: {
          windows: [{ days: WEEKDAYS, from: "18:00", to: "06:00" }],
          amount: kr(v.s1),
          pay_code: "SKIFT_1",
        },
      },
      {
        id: "skift-2",
        primitive: "time_window_supplement",
        label: "Skiftehold, tillæg 2",
        source: "§ 15 stk. 6.3",
        todo_jura:
          '"Søndagsdøgnets afslutning" er sat til mandag kl. 06.00 (døgnet regnes fra kl. 06, § 15 stk. 3.1). Tidligere start/slut efter lokalaftale (stk. 6.4) sættes i en lokalaftale.',
        applies_to: { staff_groups: ["Skiftehold"] },
        stacking: { mode: "highest", group: "skift" },
        params: {
          windows: [
            { days: ["sat"], from: "14:00", to: "24:00" },
            { days: ["sun"], from: "00:00", to: "24:00" },
            { days: ["mon"], from: "00:00", to: "06:00" },
            { days: ["holiday"], from: "00:00", to: "24:00" },
          ],
          amount: kr(v.s2),
          pay_code: "SKIFT_2",
        },
      },
      {
        id: "weekend-loerdag",
        primitive: "time_window_supplement",
        label: "Weekendarbejde lørdag 06–18",
        source: "§ 10 stk. 5 og § 13 stk. 7 nr. 2 b",
        todo_jura:
          "Påbegyndes arbejdet før lørdag kl. 06.00, må betalingerne ikke forringes (§ 10 stk. 5). Det tjekkes ikke.",
        applies_to: { staff_groups: ["Weekend"] },
        stacking: { mode: "highest", group: "weekend" },
        params: {
          windows: [{ days: ["sat"], from: "06:00", to: "18:00" }],
          amount: kr(v.otB),
          pay_code: "WEEKEND_LOER",
        },
      },
      {
        id: "weekend-nat",
        primitive: "time_window_supplement",
        label: "Weekendarbejde lørdag 18 – søndag 06",
        source: "§ 10 stk. 5 og § 13 stk. 7 nr. 2 b",
        applies_to: { staff_groups: ["Weekend"] },
        stacking: { mode: "highest", group: "weekend" },
        params: {
          windows: [{ days: ["sat"], from: "18:00", to: "06:00" }],
          amount: kr(v.otC),
          pay_code: "WEEKEND_NAT",
        },
      },
      {
        id: "weekend-soendag-fm",
        primitive: "time_window_supplement",
        label: "Weekendarbejde søn- og helligdag 06–12",
        source: "§ 10 stk. 5 og § 13 stk. 7 nr. 2 c",
        applies_to: { staff_groups: ["Weekend"] },
        stacking: { mode: "highest", group: "weekend" },
        params: {
          windows: [{ days: ["sun", "holiday"], from: "06:00", to: "12:00" }],
          amount: kr(v.otX),
          pay_code: "WEEKEND_SOEN_FM",
        },
      },
      {
        id: "weekend-soendag-em",
        primitive: "time_window_supplement",
        label: "Weekendarbejde søn- og helligdag efter 12 og før 06",
        source: "§ 10 stk. 5 og § 13 stk. 7 nr. 2 c",
        applies_to: { staff_groups: ["Weekend"] },
        stacking: { mode: "highest", group: "weekend" },
        params: {
          windows: [
            { days: ["sun", "holiday"], from: "12:00", to: "06:00" },
            { days: ["sun", "holiday"], from: "00:00", to: "06:00" },
          ],
          amount: kr(v.otC),
          pay_code: "WEEKEND_SOEN_EM",
        },
      },
      {
        id: "dagarbejde-tidsrum",
        primitive: "remark",
        label: "Dagarbejde ligger mellem kl. 06 og 18",
        source: "§ 9 stk. 1",
        severity: "WARNING",
        applies_to: { staff_groups: ["Dagarbejde"] },
        params: {
          code: "DAGARBEJDE_FOER_06",
          message:
            "Normal arbejdstid ved dagarbejde ligger mellem kl. 06 og 18. Ellers er det forskudt tid eller overarbejde.",
          show_in: ["schedule"],
          condition: { type: "starts_before", time: "06:00" },
        },
      },
      {
        id: "dagarbejde-slut",
        primitive: "remark",
        label: "Dagarbejde slutter senest kl. 18",
        source: "§ 9 stk. 1",
        severity: "WARNING",
        applies_to: { staff_groups: ["Dagarbejde"] },
        params: {
          code: "DAGARBEJDE_EFTER_18",
          message:
            "Normal arbejdstid ved dagarbejde ligger mellem kl. 06 og 18. Ellers er det forskudt tid eller overarbejde.",
          show_in: ["schedule"],
          condition: { type: "ends_after", time: "18:00" },
        },
      },
      {
        id: "dagarbejde-6-timer",
        primitive: "remark",
        label: "Mindst 6 timer pr. arbejdsdag ved 5-dages uge",
        source: "§ 9 stk. 1",
        severity: "INFO",
        applies_to: { staff_groups: ["Dagarbejde"] },
        params: {
          code: "ARBEJDSDAG_UNDER_6",
          message:
            "Når ugen er fordelt på 5 dage, må ingen arbejdsdag være under 6 timer, medmindre andet er aftalt lokalt.",
          show_in: ["schedule"],
          condition: { type: "shift_shorter_than", minutes: 360 },
        },
      },
      {
        id: "varsel-forskudt-skift",
        primitive: "notice",
        label: "5 × 24 timers varsel ved forskudt tid og skiftehold",
        source: "§ 14 stk. 5 og 7, § 15 stk. 5.3 og 8.1",
        todo_jura:
          "Varslet gælder etablering af og ændring til anden forskudt tid/skiftehold. Akut overflytning (§ 15 stk. 7 d) kræver ikke varsel, men giver tillæg 5 (tillægstype i Opsætning).",
        applies_to: { staff_groups: ["Forskudt tid", "Skiftehold"] },
        params: { change_notice_hours: 120 },
      },
      {
        id: "fravaer",
        primitive: "absence",
        label: "Fravær",
        source: "§ 29, § 30, § 32 og § 33",
        todo_jura:
          "Sygeløn efter 5 uger (yderligere højst 12 uger fuld løn uden genetillæg) og ophør ved manglende refusion beregnes ikke. Hospitalsindlæggelse er 5 dage pr. 12 måneder (her pr. kalenderår). Børneomsorgsdage m.fl. er pr. ferieafholdelsesperiode (her pr. ferieår). Ledsagelse ved kritisk sygdom (yderligere 5 dage) og begravelse registreres uden saldo.",
        params: {
          types: [
            {
              code: "sick",
              label: "Sygdom",
              payment: "full",
              pay_code: "SYG",
              counts_towards_norm: true,
              paid_from_seniority_months: 6,
            },
            {
              code: "work_injury",
              label: "Tilskadekomst",
              payment: "full",
              pay_code: "SYG_TILSKADE",
              counts_towards_norm: true,
            },
            {
              code: "child_sick",
              label: "Barns 1. sygedag",
              payment: "full",
              pay_code: "BARN_SYG",
              counts_towards_norm: true,
              paid_from_seniority_months: 9,
            },
            {
              code: "child_sick_extra",
              label: "Barns 2. og 3. sygedag (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
            },
            {
              code: "child_hospital",
              label: "Barns hospitalsindlæggelse",
              payment: "full",
              pay_code: "BARN_HOSP",
              counts_towards_norm: true,
              entitlement: { days: 5, period: "calendar_year", accrual: "upfront" },
            },
            {
              code: "child_care_day",
              label: "Børneomsorgsdag (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
              entitlement: {
                days: 2,
                period: "holiday_year",
                accrual: "upfront",
                min_seniority_months: 9,
              },
            },
            {
              code: "grandchild_care_day",
              label: "Børnebørns-omsorgsdag (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
              entitlement: {
                days: 2,
                period: "holiday_year",
                accrual: "upfront",
                min_seniority_months: 9,
              },
            },
            {
              code: "relative_escort",
              label: "Ledsagelse af nærtstående (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
              entitlement: {
                days: 2,
                period: "holiday_year",
                accrual: "upfront",
                min_seniority_months: 9,
              },
            },
            {
              code: "child_doctor",
              label: "Lægebesøg med barn (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
            },
            {
              code: "senior_day",
              label: "Seniorfridag (uden løn)",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
            },
            {
              code: "funeral",
              label: "Begravelse",
              payment: "none",
              pay_code: null,
              counts_towards_norm: true,
            },
          ],
        },
      },
      {
        id: "ferie",
        label: "Ferie og feriefridage",
        source: "§ 18 stk. 2 og § 40",
        todo_jura:
          "Feriefridage tildelt fra 1/9-2025 afholdes uden løn og betales via Fritvalgs Lønkonto (§ 25 stk. 2), som lønsystemet håndterer. Ferie ud over 20 dage kan overføres efter skriftlig aftale (§ 40 stk. 6).",
        params: {
          extra_days: {
            days_per_year: 5,
            year_start: "09-01",
            accrual: "upfront",
            min_seniority_months: 9,
          },
          transfer: { allowed: true, only_above_days: 20 },
        },
      },
    ],
  };
}

for (const v of VERSIONS)
  writeFileSync(join(dir, `v${v.version}.json`), `${JSON.stringify(document(v), null, 2)}\n`);

/**
 * Startpakke: what a new customer base on this agreement gets besides the
 * agreement itself. Supplement types carry their amount per rate date; the
 * one in force when the base is created is used.
 */
const supplement = (name, pay_code, amount_type, key) => ({
  name,
  pay_code,
  amount_type,
  amounts: VERSIONS.map((v) => ({ valid_from: v.valid_from, amount: v[key] })),
});
const starter = {
  key: "industriens-overenskomst",
  name: "Industriens Overenskomst",
  agreement: "industriens-overenskomst",
  description:
    "Industriens Overenskomst som standardoverenskomst, lønperioder på 14 dage (§ 28) og tillæg, der betales pr. gang eller pr. time, når situationen opstår.",
  pay_period_groups: [
    // § 28 stk. 1: two weeks from the start of the calendar week.
    { name: "Timelønnede (14 dage)", frequency: "biweekly", anchor_date: "2026-01-05" },
  ],
  supplement_types: [
    supplement(
      "Overarbejde ikke varslet dagen før (§ 13 stk. 5)",
      "OT_IKKE_VARSLET",
      "fixed",
      "varsel",
    ),
    supplement(
      "Spisepause udskudt over ½ time (§ 13 stk. 7)",
      "SPISEPAUSE_UDSKUDT",
      "fixed",
      "spise",
    ),
    supplement(
      "Skiftehold tillæg 3: ingen erstatningsfridag (§ 15 stk. 6.6)",
      "SKIFT_3",
      "per_hour",
      "s3",
    ),
    supplement(
      "Skiftehold tillæg 4: forskudt vagtlistefridag (§ 15 stk. 8.5)",
      "SKIFT_4",
      "per_hour",
      "s4",
    ),
    supplement("Skiftehold tillæg 5: akut overflytning (§ 15 stk. 8.4)", "SKIFT_5", "fixed", "s5"),
    supplement("Udearbejde (§ 19 stk. 2)", "UDEARBEJDE", "per_hour", "ude"),
  ],
};
writeFileSync(join(dir, "startpakke.json"), `${JSON.stringify(starter, null, 2)}\n`);
