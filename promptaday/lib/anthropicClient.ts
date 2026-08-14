import Anthropic from "@anthropic-ai/sdk";

// Zero-arg constructor resolves ANTHROPIC_API_KEY (or an `ant auth login`
// profile) from the environment — nothing to configure here beyond that.
export function createAnthropicClient(): Anthropic {
  return new Anthropic();
}
