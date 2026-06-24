import { generateObject } from "ai";
import { z } from "zod";

export type Triage = {
  decision: "reject" | "review";
  risk: number;
  categories: string[];
  reason: string;
};

const schema = z.object({
  decision: z
    .enum(["reject", "review"])
    .describe("'reject' only for clearly illegal content, doxxing/PII, or slurs/hate. Otherwise 'review'."),
  risk: z.number().min(0).max(10).describe("0 = harmless, 10 = clearly illegal/dangerous"),
  categories: z.array(z.string()).describe("short tags e.g. defamation, pii, harassment, spam, harmless"),
  reason: z.string().describe("one short sentence for the human moderator"),
});

// LLM pre-screen. Assistive only: a human still publishes everything that isn't
// auto-rejected. ponytail: any failure (no key, model down) returns a safe
// fallback that routes the item to manual review — it never auto-approves.
export async function triage(body: string): Promise<Triage> {
  const fallback: Triage = {
    decision: "review",
    risk: 0,
    categories: ["unscreened"],
    reason: "LLM triage unavailable; needs manual review.",
  };
  if (!process.env.AI_GATEWAY_API_KEY) return fallback;

  try {
    const { object } = await generateObject({
      model: process.env.MOD_MODEL || "openai/gpt-4o-mini",
      schema,
      prompt:
        "You moderate an anonymous public gossip board. Flag the submission below. " +
        "Reject ONLY clearly illegal content, real-person doxxing/PII (addresses, phone, etc.), " +
        "or slurs/hate. Everything else is 'review' for a human.\n\nSubmission:\n" +
        body,
    });
    return object;
  } catch {
    return fallback;
  }
}
