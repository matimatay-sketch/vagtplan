import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { proposalOutputSchema, type ProposalOutput } from "@/lib/domain/proposal";

/** The model used by the assistant. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

export type Usage = { inputTokens: number; outputTokens: number };
export type Outcome = "ok" | "refused" | "error";

/** The server has a key (ANTHROPIC_API_KEY); without one the assistant is unavailable. */
export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client() {
  // The key and an optional ANTHROPIC_BASE_URL are read from the environment.
  return new Anthropic({ maxRetries: 2, timeout: 120_000 });
}

const usageOf = (m: Anthropic.Message): Usage => ({
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
});

/** A text answer (pseudonymized in and out). */
export async function askText(
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<{ text: string; usage: Usage; outcome: Outcome }> {
  const stream = client().messages.stream({
    model: ASSISTANT_MODEL,
    max_tokens: 4000,
    system,
    messages,
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal")
    return { text: "", usage: usageOf(message), outcome: "refused" };
  const text = message.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  return { text, usage: usageOf(message), outcome: "ok" };
}

/** A schedule proposal as structured output. */
export async function askProposal(
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<{
  proposal: ProposalOutput | null;
  raw: Anthropic.ContentBlock[];
  usage: Usage;
  outcome: Outcome;
}> {
  const stream = client().messages.stream({
    model: ASSISTANT_MODEL,
    max_tokens: 16000,
    system,
    messages,
    output_config: { format: zodOutputFormat(proposalOutputSchema) },
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal")
    return { proposal: null, raw: message.content, usage: usageOf(message), outcome: "refused" };
  if (message.stop_reason === "max_tokens")
    return { proposal: null, raw: message.content, usage: usageOf(message), outcome: "error" };
  return {
    proposal: message.parsed_output ?? null,
    raw: message.content,
    usage: usageOf(message),
    outcome: message.parsed_output ? "ok" : "error",
  };
}

export const isApiError = (e: unknown): e is InstanceType<typeof Anthropic.APIError> =>
  e instanceof Anthropic.APIError;
