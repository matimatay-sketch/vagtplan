import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/domain/api";

const range = [
  { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
  {
    name: "to",
    in: "query",
    required: true,
    schema: { type: "string", format: "date" },
    description: "Inclusive; at most 93 days after from.",
  },
];
const paging = [
  { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 1000 } },
  { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
];
const ok = (description: string) => ({ "200": { description } });
const op = (summary: string, scope: string, extra: Record<string, unknown> = {}) => ({
  summary,
  description: `Scope: \`${scope}\`.`,
  security: [{ apiKey: [] }],
  ...extra,
});
const body = (properties: Record<string, unknown>, required: string[]) => ({
  requestBody: {
    required: true,
    content: { "application/json": { schema: { type: "object", properties, required } } },
  },
});

/** The OpenAPI description of /api/v1, served at /api/v1/openapi.json. */
export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Turnus API",
      version: "1.0.0",
      description: [
        "REST API for Turnus. Authenticate with an API key from Settings → Integrations: `Authorization: Bearer tk_…`.",
        "Each key belongs to one organization and has scopes. Times are UTC (ISO 8601); dates are YYYY-MM-DD in Europe/Copenhagen.",
        'Money is in øre and durations in minutes (integers). Errors: `{ "error": { "code", "message" } }`.',
        `Scopes: ${API_SCOPES.map((s) => s.key).join(", ")}.`,
        `Webhook events: ${WEBHOOK_EVENTS.map((e) => e.key).join(", ")} (and ping). Each delivery is POSTed as JSON with the headers Turnus-Event, Turnus-Delivery and Turnus-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the endpoint secret>. Answer 2xx; failed deliveries are retried with backoff.`,
      ].join("\n\n"),
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", bearerFormat: "tk_…" } },
    },
    paths: {
      "/employees": {
        get: op("List employees with departments and contracts", "employees.read", {
          parameters: [
            ...paging,
            { name: "employee_number", in: "query", schema: { type: "string" } },
            { name: "include_archived", in: "query", schema: { type: "boolean" } },
          ],
          responses: ok("Employees"),
        }),
        post: op("Create an employee", "employees.write", {
          ...body(
            {
              employee_number: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              birth_date: { type: "string", format: "date" },
              email: { type: "string", format: "email" },
              phone: { type: "string" },
              hired_on: { type: "string", format: "date" },
              department_ids: {
                type: "array",
                items: { type: "string", format: "uuid" },
                description: "The first is the primary department.",
              },
            },
            ["employee_number", "first_name", "last_name", "birth_date", "department_ids"],
          ),
          responses: {
            "201": { description: "Created" },
            "409": { description: "Employee number in use" },
          },
        }),
      },
      "/employees/{id}": {
        get: op("Get an employee", "employees.read", { responses: ok("Employee") }),
        patch: op("Update an employee (archived: true ends access)", "employees.write", {
          ...body(
            {
              employee_number: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              birth_date: { type: "string", format: "date" },
              email: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              hired_on: { type: ["string", "null"], format: "date" },
              terminated_on: { type: ["string", "null"], format: "date" },
              archived: { type: "boolean" },
            },
            [],
          ),
          responses: ok("Employee"),
        }),
      },
      "/employees/{id}/contracts": {
        post: op("Add a contract", "employees.write", {
          ...body(
            {
              agreement_id: { type: "string", format: "uuid" },
              pay_form: { enum: ["hourly", "monthly"] },
              weekly_minutes: { type: "integer", description: "37 hours = 2220" },
              pay_period_group_id: { type: "string", format: "uuid" },
              staff_group: { type: "string" },
              valid_from: { type: "string", format: "date" },
              valid_to: { type: "string", format: "date" },
            },
            ["agreement_id", "pay_form", "weekly_minutes", "pay_period_group_id", "valid_from"],
          ),
          responses: { "201": { description: "Created" } },
        }),
      },
      "/departments": {
        get: op("List departments", "employees.read", { responses: ok("Departments") }),
        post: op("Create a department", "employees.write", {
          ...body({ name: { type: "string" } }, ["name"]),
          responses: { "201": { description: "Created" } },
        }),
      },
      "/agreements": {
        get: op("Agreements for contracts", "employees.read", { responses: ok("Agreements") }),
      },
      "/pay-period-groups": {
        get: op("Pay period groups", "employees.read", { responses: ok("Groups") }),
      },
      "/posting-dimensions": {
        get: op("Posting dimensions and values (projects: project = true)", "posting.read", {
          responses: ok("Dimensions"),
        }),
      },
      "/shifts": {
        get: op("The published schedule", "schedule.read", {
          parameters: [
            ...range,
            { name: "department_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: ok("Shifts"),
        }),
      },
      "/time-entries": {
        get: op("Registered time (current versions)", "time.read", {
          parameters: [
            ...range,
            ...paging,
            { name: "status", in: "query", schema: { enum: ["open", "pending", "approved"] } },
            { name: "employee_number", in: "query", schema: { type: "string" } },
          ],
          responses: ok("Time entries"),
        }),
      },
      "/stamps": {
        post: op("Stamp in or out (terminals)", "time.stamp", {
          ...body(
            {
              employee_number: { type: "string" },
              employee_id: { type: "string", format: "uuid" },
              action: { enum: ["in", "out"] },
              at: { type: "string", format: "date-time" },
              client_id: {
                type: "string",
                format: "uuid",
                description: "Idempotency key from the terminal.",
              },
            },
            ["action", "client_id"],
          ),
          responses: {
            "200": { description: "The registration" },
            "409": { description: "already_in / not_in" },
          },
        }),
      },
      "/absences": {
        get: op("Absence overlapping the period", "absence.read", {
          parameters: [
            ...range,
            {
              name: "status",
              in: "query",
              schema: { enum: ["requested", "approved", "rejected", "cancelled"] },
            },
          ],
          responses: ok("Absences"),
        }),
      },
      "/pay-periods": {
        get: op("Pay periods", "payroll.read", {
          parameters: [
            ...paging,
            { name: "status", in: "query", schema: { enum: ["open", "closed"] } },
          ],
          responses: ok("Pay periods"),
        }),
      },
      "/pay-periods/{id}/lines": {
        get: op("Pay lines of a period", "payroll.read", { responses: ok("Pay lines") }),
      },
    },
  };
}
