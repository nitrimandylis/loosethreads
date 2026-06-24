import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

// NVIDIA NIM is OpenAI-compatible. Point at the hosted endpoint
// (https://integrate.api.nvidia.com/v1, key from build.nvidia.com) or a
// self-hosted NIM container by setting NVIDIA_NIM_BASE_URL.
const nim = createOpenAICompatible({
  name: "nvidia-nim",
  baseURL: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_NIM_API_KEY,
});

// Pick a model that supports structured output. Override with MOD_MODEL.
const MODEL = process.env.MOD_MODEL || "meta/llama-3.1-8b-instruct";

// Enabled when we have a key (hosted) or a custom base URL (self-hosted NIM
// that may not need a key).
const enabled = !!(process.env.NVIDIA_NIM_API_KEY || process.env.NVIDIA_NIM_BASE_URL);

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
  if (!enabled) return fallback;

  try {
    const { object } = await generateObject({
      model: nim.chatModel(MODEL),
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
