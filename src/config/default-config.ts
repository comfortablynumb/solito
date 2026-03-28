import { CommandConfig, SolardiConfig } from "./config";

export function listBuiltInCommandNames(): string[] {
  const defaults = createDefaultConfig();
  return Object.keys(defaults.commands!);
}

export function createDefaultConfig(): SolardiConfig {
  return {
    default_agent: "claude",
    loop: {
      max_turn_time_minutes: 20,
      stale: {
        first_warning: 2,
        second_warning: 2,
        stop: 2,
      },
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
        variables: {
          thresholds: {
            min_coverage_pct_enhancement_per_loop: 0.5,
            test_timeout_minutes: 10,
          },
          max_loops_without_enhancement: 3,
        },
      },
      build: {
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
      "hunt-bugs": {
        variables: {
          max_loops_without_bugs: 3,
        },
      },
      "generate-spec": {
        requires_prompt: true,
        one_shot: true,
      },
    },
  };
}

export function mergeWithDefaults(partial: Partial<SolardiConfig>): SolardiConfig {
  const defaults = createDefaultConfig();

  return {
    default_agent: partial.default_agent ?? defaults.default_agent,
    loop: {
      max_turn_time_minutes:
        partial.loop?.max_turn_time_minutes ?? defaults.loop.max_turn_time_minutes,
      stale: partial.loop?.stale ?? defaults.loop.stale,
      continue_prompt:
        partial.loop?.continue_prompt ?? defaults.loop.continue_prompt,
      timeout_prompt:
        partial.loop?.timeout_prompt ?? defaults.loop.timeout_prompt,
    },
    agents: {
      ...defaults.agents,
      ...partial.agents,
    },
    commands: mergeCommandEntries(defaults.commands, partial.commands),
  };
}

function mergeCommandEntries(
  defaults: Record<string, CommandConfig> | undefined,
  overrides: Record<string, CommandConfig> | undefined,
): Record<string, CommandConfig> {
  const result: Record<string, CommandConfig> = { ...defaults };

  for (const [name, override] of Object.entries(overrides ?? {})) {
    result[name] = { ...(defaults?.[name] ?? {}), ...override };
  }

  return result;
}
