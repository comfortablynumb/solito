import { SolitoConfig } from "./config";

export function listBuiltInCommandNames(): string[] {
  const defaults = createDefaultConfig();
  return Object.keys(defaults.commands ?? {});
}

export function createDefaultConfig(): SolitoConfig {
  return {
    default_agent: "claude",
    loop: {
      max_turn_time_minutes: 15,
      continue_prompt: "Continue where you left off.",
      timeout_prompt: "You have reached the time limit for this loop. Please finish what you are currently doing and provide a summary of your progress.",
    },
    agents: {
      claude: {
        type: "claude",
      },
    },
    commands: {
      quality: {
        prompt: "${var:solito_root_dir}/prompts/quality.md",
        variables: {
          thresholds: {
            min_coverage_pct_enhancement_per_loop: 0.5,
            test_timeout_minutes: 10,
          },
          max_loops_without_enhancement: 3,
        },
      },
      build: {
        prompt: "${var:solito_root_dir}/prompts/build.md",
        variables: {
          specs_dir: "specs",
          max_consecutive_failures: 5,
          thresholds: {
            min_coverage_pct_enhancement_per_loop: 0.5,
            test_timeout_minutes: 10,
          },
          max_loops_without_enhancement: 3,
        },
      },
    },
  };
}

export function mergeWithDefaults(partial: Partial<SolitoConfig>): SolitoConfig {
  const defaults = createDefaultConfig();

  return {
    default_agent: partial.default_agent ?? defaults.default_agent,
    loop: {
      max_turn_time_minutes:
        partial.loop?.max_turn_time_minutes ?? defaults.loop.max_turn_time_minutes,
      continue_prompt:
        partial.loop?.continue_prompt ?? defaults.loop.continue_prompt,
      timeout_prompt:
        partial.loop?.timeout_prompt ?? defaults.loop.timeout_prompt,
    },
    agents: {
      ...defaults.agents,
      ...partial.agents,
    },
    commands: {
      ...defaults.commands,
      ...partial.commands,
    },
  };
}
