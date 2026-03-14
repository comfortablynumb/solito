import { z } from "zod";

const agentConfigSchema = z.object({
  type: z.string(),
  append_system_prompt: z.string().optional(),
});

const loopConfigSchema = z.object({
  max_turn_time_minutes: z.number().positive(),
  continue_prompt: z.string().optional(),
  timeout_prompt: z.string().optional(),
});

const commandVariablesSchema: z.ZodType<Record<string, string | number | boolean | Record<string, unknown>>> = z.lazy(() =>
  z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), commandVariablesSchema]),
  ),
);

const commandConfigSchema = z.object({
  prompt: z.string(),
  variables: commandVariablesSchema.optional(),
  append_system_prompt: z.string().optional(),
});

const solitoConfigSchema = z.object({
  default_agent: z.string(),
  loop: loopConfigSchema,
  agents: z.record(z.string(), agentConfigSchema),
  commands: z.record(z.string(), commandConfigSchema).optional(),
});

export type ValidatedConfig = z.infer<typeof solitoConfigSchema>;

export interface ConfigValidationResult {
  success: boolean;
  config?: ValidatedConfig;
  errors?: string[];
}

export function validateConfig(data: unknown): ConfigValidationResult {
  const result = solitoConfigSchema.safeParse(data);

  if (result.success) {
    return { success: true, config: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );

  return { success: false, errors };
}
