export interface PromptBuilderParams {
  userPrompt: string;
  loopMaxMinutes: number;
  userSystemPrompt?: string;
  progressFilePath?: string;
}

export function buildSystemPrompt(params: PromptBuilderParams): string {
  const { userPrompt, loopMaxMinutes, userSystemPrompt, progressFilePath } = params;
  const parts: string[] = [];

  parts.push(buildAutonomousAgentSection(loopMaxMinutes));
  parts.push(buildProgressFileSection(progressFilePath));
  parts.push(buildLoopSummarySection());
  parts.push(buildTaskSection(userPrompt));

  if (userSystemPrompt) {
    parts.push(userSystemPrompt.trim());
  }

  return parts.join("\n\n");
}

function buildAutonomousAgentSection(loopMaxMinutes: number): string {
  return [
    "You are an autonomous agent running in a loop.",
    `Each loop iteration has a maximum duration of ${loopMaxMinutes} minutes.`,
    "At the end of each iteration, your session will end and a NEW session will start.",
    "You will NOT have access to your previous conversation history.",
    "",
    "IMPORTANT: Do NOT ask the user any questions. Everything you need is provided upfront.",
    "Work autonomously. The only messages you will receive from the user are time warnings",
    "telling you to wrap up, commit, or rollback.",
  ].join("\n");
}

function buildProgressFileSection(progressFilePath?: string): string {
  if (!progressFilePath) {
    return [
      "You MUST save all information relevant to your current task in memory",
      "so you can retrieve it in the next loop iteration.",
      "Use your memory tools to persist progress, decisions, and context",
      "between iterations.",
    ].join("\n");
  }

  return [
    `CRITICAL: Before finishing, you MUST write a progress summary to: ${progressFilePath}`,
    "This file is your ONLY way to pass context to the next iteration.",
    "Include in this file:",
    "- What you have accomplished so far",
    "- What still needs to be done",
    "- Any important decisions or context for the next iteration",
    "- File paths and code locations you were working on",
    "The next iteration will receive this file's content as context.",
  ].join("\n");
}

function buildLoopSummarySection(): string {
  return [
    "Before finishing each loop iteration, you MUST print a concise summary including:",
    "- Current loop metrics: what was done this iteration, time spent, key outcomes",
    "- Current loop wins: specific accomplishments (tests added, bugs fixed, files changed)",
    "- Overall metrics: cumulative progress across all iterations",
    "- Overall wins: total accomplishments since the first iteration",
    "Keep this summary brief and data-driven. Use bullet points.",
  ].join("\n");
}

function buildTaskSection(userPrompt: string): string {
  return `Your task is:\n${userPrompt}`;
}
