// A local stand-in for the Messages API used by the e2e tests (the app is
// started with ANTHROPIC_BASE_URL pointing here). It records every request so
// the tests can check that only pseudonymized data is sent.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4545);
const requests = [];
let proposalCalls = 0;

function sse(res, text) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("message_start", {
    type: "message_start",
    message: {
      id: `msg_${requests.length}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 1 },
    },
  });
  send("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });
  send("content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });
  send("content_block_stop", { type: "content_block_stop", index: 0 });
  send("message_delta", {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 50 },
  });
  send("message_stop", { type: "message_stop" });
  res.end();
}

function proposal(body) {
  proposalCalls++;
  const first = body.messages[0].content;
  const ctx = JSON.parse(first.slice(first.indexOf("{"), first.lastIndexOf("}") + 1));
  const monday = ctx.week.slice(0, 10);
  const shifts = ctx.employees.slice(0, 2).map((e) => ({
    employee: e.code,
    date: monday,
    start: "08:00",
    end: "16:00",
    unpaid_break_minutes: 30,
    label: "Åbning",
  }));
  // The first answer has a shift for an unknown person, which the app reports back.
  if (body.messages.length === 1)
    shifts.push({
      employee: "MEDARBEJDER_99",
      date: monday,
      start: "10:00",
      end: "14:00",
      unpaid_break_minutes: 0,
      label: null,
    });
  return JSON.stringify({ shifts, notes: `Forslag til ${ctx.employees[0]?.code ?? "ingen"}.` });
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return res.end("ok");
  if (req.method === "GET" && req.url === "/__requests") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ requests, proposalCalls }));
  }
  if (req.method === "POST" && req.url === "/__reset") {
    requests.length = 0;
    proposalCalls = 0;
    return res.end("ok");
  }
  if (req.method === "POST" && req.url?.startsWith("/v1/messages")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const system = typeof body.system === "string" ? body.system : "";
      if (system.includes("planlægningsassistent")) return sse(res, proposal(body));
      return sse(
        res,
        "MEDARBEJDER_1 har ingen lønlinjer i perioden, så der er intet at forklare. Spørg igen, når der er godkendt tid.",
      );
    });
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, "127.0.0.1");
