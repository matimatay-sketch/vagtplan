# Integrationer: API og webhooks

Turnus har et REST API (`/api/v1`) og webhooks, så lønsystemer, stempelure, HR-systemer og rapporteringsværktøjer kan tale med Turnus.

- **Dokumentation:** `https://<adresse>/api/v1/openapi.json` (OpenAPI 3.1). Den kan åbnes i Postman, Insomnia eller Swagger.
- **Opsætning:** Indstillinger → Integrationer. Det kræver rettigheden "Oprette API-nøgler og webhooks" (`integrations.manage`).

## API-nøgler

- Opret én nøgle pr. system, og giv den kun de rettigheder (scopes), systemet har brug for.
- Nøglen vises én gang. Turnus gemmer kun en hash af den.
- Send nøglen som `Authorization: Bearer tk_…`.
- En spærret nøgle virker ikke længere.

| Scope             | Giver adgang til                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `employees.read`  | `GET /employees`, `/employees/{id}`, `/departments`, `/agreements`, `/pay-period-groups`          |
| `employees.write` | `POST /employees`, `PATCH /employees/{id}`, `POST /employees/{id}/contracts`, `POST /departments` |
| `schedule.read`   | `GET /shifts` (den offentliggjorte vagtplan)                                                      |
| `time.read`       | `GET /time-entries`                                                                               |
| `time.stamp`      | `POST /stamps` (stempelure)                                                                       |
| `absence.read`    | `GET /absences`                                                                                   |
| `payroll.read`    | `GET /pay-periods`, `/pay-periods/{id}/lines`                                                     |
| `posting.read`    | `GET /posting-dimensions` (kontering og projekter)                                                |

### Konventioner

- **Tid:** tidspunkter er UTC (ISO 8601). Datoer er `YYYY-MM-DD` og gælder dansk tid.
- **Penge:** heltal i øre.
- **Varighed:** heltal i minutter. Km-lønlinjer angives i meter.
- **Perioder:** `from` og `to` er begge medregnet, og der må højst være 93 dage mellem dem.
- **Sider:** lister bruger `limit` (højst 1000) og `offset`.
- **Fejl:** `{"error": {"code": "…", "message": "…"}}`. Statuskoderne er 401 (nøgle), 403 (`insufficient_scope`), 404, 409 (fx `already_in`, `not_in` eller et medarbejdernummer, der er i brug) og 422 (ugyldige data).

### Stempelure

`POST /stamps` modtager:

```json
{ "employee_number": "1002", "action": "in", "at": "2027-03-01T07:02:00Z", "client_id": "<uuid>" }
```

- `client_id` er en UUID, som terminalen laver pr. stempling. Sendes den samme igen, oprettes der ingen dublet.
- `at` er valgfri og må højst ligge 7 dage tilbage. Stemplinger, der kommer mere end 5 minutter for sent, markeres som "offline".

## Webhooks

- Turnus sender en `POST` med JSON, når en hændelse sker. Hændelserne er:
  - `time_entry.approved`
  - `pay_period.closed`
  - `absence.decided`
  - `schedule.published`
  - `employee.created`
  - `employee.updated`
- Knappen "Send test" sender hændelsen `ping`.
- Beskeden ser sådan ud:

```json
{
  "id": "<uuid>",
  "event": "time_entry.approved",
  "created_at": "…",
  "organization_id": "…",
  "data": { "…": "…" }
}
```

### Signatur

Hver besked har headeren `Turnus-Signature: t=<unix-sekunder>,v1=<hex>`. Her er `v1` HMAC-SHA256 af `"<t>.<rå body>"` med webhookens hemmelighed. Kontrollér den, og afvis gamle tidsstempler:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, header, rawBody) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const mac = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && timingSafeEqual(Buffer.from(mac), Buffer.from(v1));
}
```

### Levering og genforsøg

- Svar med en 2xx-status. Ellers prøves beskeden igen efter 1, 2, 4, 8 … minutter, op til 8 forsøg.
- Brug `Turnus-Delivery` (beskedens id) til at sortere dubletter fra.
- Turnus sender med det samme efter handlingen. Genforsøg sendes ved næste aktivitet og af et cron-job (`/api/cron/webhooks`, beskyttet af `CRON_SECRET`).
- Webhook-adresser skal være `https` og må ikke pege på et internt netværk.
