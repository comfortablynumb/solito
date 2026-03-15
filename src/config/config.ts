export interface AgentConfig {
  type: string;
  append_system_prompt?: string;
}

export interface StaleThresholds {
  first_warning: number;
  second_warning: number;
  stop: number;
}

export interface LoopConfig {
  max_turn_time_minutes: number;
  continue_prompt?: string;
  timeout_prompt?: string;
  stale?: StaleThresholds;
}

export interface CommandVariables {
  [key: string]: string | number | boolean | CommandVariables;
}

export interface CommandConfig {
  prompt: string;
  variables?: CommandVariables;
  append_system_prompt?: string;
}

export interface SolitoConfig {
  default_agent: string;
  loop: LoopConfig;
  agents: Record<string, AgentConfig>;
  commands?: Record<string, CommandConfig>;
}

export interface ConfigLoader {
  load(): Promise<SolitoConfig>;
}
