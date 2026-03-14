import { ITERATION_COMPLETE_MARKER, EXIT_MARKER } from "../constants";

export interface PromptBuilderParams {
  userPrompt: string;
  loopMaxMinutes: number;
  userSystemPrompt?: string;
  progressFilePath?: string;
  isFirstIteration?: boolean;
  workDir?: string;
}

export function buildSystemPrompt(params: PromptBuilderParams): string {
  const { userPrompt, loopMaxMinutes, userSystemPrompt, progressFilePath, isFirstIteration, workDir } = params;
  const parts: string[] = [];

  parts.push(buildAutonomousAgentSection(loopMaxMinutes));

  if (workDir) {
    parts.push(buildWorkDirSection(workDir));
  }

  if (isFirstIteration) {
    parts.push(buildToolCheckSection());
  }

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
    "",
    "WHEN TO END AN ITERATION:",
    "After you have made a change, validated it, committed it, and written your progress summary,",
    `output exactly this string on its own line: ${ITERATION_COMPLETE_MARKER}`,
    "This signals the orchestrator to end the current iteration and start a new one.",
    "Do NOT wait for further input after outputting this marker.",
    "",
    "CRITICAL: Do NOT output the marker just because you think 'there is nothing left to do'.",
    "There is ALWAYS more work if any of these are true:",
    "- Coverage is below 100%",
    "- Any function has cyclomatic complexity above 10",
    "- There are linter warnings",
    "- There are failing tests",
    "If metrics show room for improvement, you MUST attempt at least one change per iteration.",
    "Only use the marker after you have made and committed a change (or after exhausting",
    "multiple attempts and logging them as failures in the progress file).",
    "",
    "CRITICAL — TEST EXECUTION STRATEGY:",
    "NEVER run the full test suite as your first step. Full test suites can be slow",
    "and will waste your entire iteration time budget.",
    "Instead, ALWAYS follow this order:",
    "1. FIRST, if the progress file mentions URGENT/slow test issues, fix those BEFORE running any tests.",
    "2. Run ONLY the specific test file(s) related to your current changes.",
    "3. Only run the full test suite as a FINAL verification after all targeted tests pass.",
    "4. If ANY test run (even a single file) takes more than 2 minutes, STOP it immediately.",
    "   Then investigate and fix the root cause of the slowness before re-running.",
    "5. Record slow tests in the progress file as URGENT for the next iteration.",
    "NEVER re-run a slow test suite hoping it will pass faster. Fix the slowness first.",
  ].join("\n");
}

function buildWorkDirSection(workDir: string): string {
  return [
    "CRITICAL — TEMPORARY FILES:",
    `Your working directory for temporary files, scripts, logs, and any generated artifacts is: ${workDir}`,
    "You MUST place ALL temporary files in this directory. NEVER create temporary files in the project root.",
    "Examples of files that MUST go in the working directory:",
    "- Helper scripts (e.g., complexity analysis scripts, test runners)",
    "- Log files, JSON reports, TSV logs",
    "- Any file that is not part of the project's source code",
    "The ONLY files you should create in the project root are files that belong to the project itself",
    "(source code, configs like eslint.config.mjs, .gitignore, etc.).",
  ].join("\n");
}

function buildToolCheckSection(): string {
  return [
    "CRITICAL — FIRST ITERATION SETUP:",
    "Before doing ANY other work, you MUST verify that all required tools are installed AND working.",
    "For EACH tool below, run a real command and confirm it produces output — do NOT just check if the binary exists.",
    "",
    "1. Code coverage tool:",
    "   - Rust: `cargo llvm-cov --version` or `cargo tarpaulin --version` (install: `cargo install cargo-llvm-cov`)",
    "   - TypeScript: `npx c8 --version` (install: `npm install --save-dev c8`)",
    "   - Go: built-in (`go test -cover`)",
    "   - Java: JaCoCo plugin in pom.xml/build.gradle (verify: `mvn jacoco:report` or `./gradlew jacocoTestReport`)",
    "",
    "2. Cyclomatic complexity analyzer:",
    "   - Rust: `rust-code-analysis-cli --version` (install: `cargo install rust-code-analysis-cli --locked`)",
    "   - TypeScript: `npx code-complexity --version` (install: `npm install --save-dev code-complexity`)",
    "     Usage: `npx code-complexity . --limit 10 --sort ratio` — shows functions sorted by complexity ratio",
    "   - Go: `gocyclo -avg . 2>&1 | head -1` (install: `go install github.com/fzipp/gocyclo/cmd/gocyclo@latest`)",
    "   - Java: PMD plugin with cyclomatic complexity rule in pom.xml/build.gradle",
    "",
    "3. Linter:",
    "   - Rust: `cargo clippy --version` (install: `rustup component add clippy`)",
    "   - TypeScript: `npx eslint --version` (install: `npm install --save-dev eslint`)",
    "     If no eslint config exists, CREATE one (eslint.config.mjs) with basic recommended rules.",
    "   - Go: `golangci-lint --version`",
    "   - Java: Checkstyle plugin in pom.xml/build.gradle (verify: `mvn checkstyle:check` or `./gradlew checkstyleMain`)",
    "",
    "If ANY tool fails, is missing, or has no config: install it and create the config IMMEDIATELY.",
    "Without working tools you CANNOT measure quality metrics, and your iteration will be wasted.",
    "",
    "If you CANNOT install a required tool (e.g., permission denied, network error, unsupported platform),",
    "clearly explain which tool is missing and why installation failed, then output this marker:",
    `${EXIT_MARKER}`,
    "This will stop the entire application. The user must install the tool manually before retrying.",
    "Do NOT continue without working tools — the results would be meaningless.",
    "",
    "This check is ONLY needed on the first iteration — subsequent iterations can skip it.",
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
    "- URGENT items: blockers like slow tests that MUST be fixed first in the next iteration",
    "- What you have accomplished so far",
    "- What still needs to be done",
    "- Any important decisions or context for the next iteration",
    "- File paths and code locations you were working on",
    "The next iteration will receive this file's content as context.",
    "The next iteration MUST address URGENT items before continuing other work.",
  ].join("\n");
}

function buildLoopSummarySection(): string {
  return [
    "Before finishing each loop iteration, you MUST print a concise summary including:",
    "- Key metrics delta (ALWAYS include these when available):",
    "  - Code coverage: X% -> Y% (delta)",
    "  - Cyclomatic complexity: avg X -> Y, max X -> Y",
    "  - Test results: X passing, Y failing",
    "  - Linter warnings: X -> Y",
    "- Current loop: what was done, what changed, time spent",
    "- Current loop wins: specific accomplishments (coverage gained, complexity reduced, bugs fixed)",
    "- Overall progress: cumulative metric deltas since first iteration",
    "- Next iteration tasks, ordered by priority:",
    "  - URGENT: blockers, slow tests, broken builds — must be fixed immediately",
    "  - HIGH: tasks required to complete the current goal",
    "  - MEDIUM: improvements, cleanup, or nice-to-haves",
    "Keep this summary brief and data-driven. Use bullet points.",
    "",
    "CRITICAL: Coverage AND cyclomatic complexity are BOTH PRIMARY quality signals.",
    "Test count alone is NOT sufficient. You MUST measure and report BOTH metrics every iteration.",
    "If complexity is high (avg > 10 or max > 20), reducing it is as important as increasing coverage.",
    "Refactor complex functions into smaller ones — this is NOT optional, it is a quality requirement.",
    "",
    "MANDATORY COMPLEXITY CHECK:",
    "You MUST run a cyclomatic complexity tool EVERY iteration and include the numeric results.",
    "If you skip complexity measurement, the iteration is considered a FAILURE regardless of other metrics.",
    "Use the appropriate tool for the project language (see Section 7.2 of the task prompt).",
    "If no complexity tool is available, install one BEFORE doing any other work.",
  ].join("\n");
}

function buildTaskSection(userPrompt: string): string {
  return `Your task is:\n${userPrompt}`;
}
