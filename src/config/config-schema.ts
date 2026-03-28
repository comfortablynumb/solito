import { z } from "zod";

const agentConfigSchema = z.object({
  type: z.string(),
  append_system_prompt: z.string().optional(),
});

const staleThresholdsSchema = z.object({
  first_warning: z.number().int().positive(),
  second_warning: z.number().int().positive(),
  stop: z.number().int().positive(),
});

const loopConfigSchema = z.object({
  max_turn_time_minutes: z.number().positive(),
  continue_prompt: z.string().optional(),
  timeout_prompt: z.string().optional(),
  stale: staleThresholdsSchema.optional(),
});

const commandVariablesSchema: z.ZodType<Record<string, string | number | boolean | Record<string, unknown>>> = z.lazy(() =>
  z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), commandVariablesSchema]),
  ),
);

const commandConfigSchema = z.object({
  prompt: z.string().optional(),
  variables: commandVariablesSchema.optional(),
  append_system_prompt: z.string().optional(),
  requires_prompt: z.boolean().optional(),
  one_shot: z.boolean().optional(),
});

const solardiConfigSchema = z.object({
  default_agent: z.string(),
  loop: loopConfigSchema,
  agents: z.record(z.string(), agentConfigSchema),
  commands: z.record(z.string(), commandConfigSchema).optional(),
});

export type ValidatedConfig = z.infer<typeof solardiConfigSchema>;

export interface ConfigValidationResult {
  success: boolean;
  config?: ValidatedConfig;
  errors?: string[];
}

export function validateConfig(data: unknown): ConfigValidationResult {
  const result = solardiConfigSchema.safeParse(data);

  if (result.success) {
    return { success: true, config: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );

  return { success: false, errors };
}
