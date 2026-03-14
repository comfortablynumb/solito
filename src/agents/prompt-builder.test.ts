import { buildSystemPrompt } from "./prompt-builder";

describe("buildSystemPrompt", () => {
  it("includes autonomous agent instructions", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "fix the bug",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("autonomous agent");
    expect(prompt).toContain("loop");
    expect(prompt).toContain("5 minutes");
  });

  it("includes the user task", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "refactor auth module",
      loopMaxMinutes: 10,
    });

    expect(prompt).toContain("Your task is:");
    expect(prompt).toContain("refactor auth module");
  });

  it("includes generic memory instructions when no progress file", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("memory");
    expect(prompt).toContain("save all information");
  });

  it("includes progress file instructions when path is provided", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      progressFilePath: "/home/user/.solito/loop-progress.md",
    });

    expect(prompt).toContain("/home/user/.solito/loop-progress.md");
    expect(prompt).toContain("progress summary");
    expect(prompt).toContain("CRITICAL");
    expect(prompt).toContain("What you have accomplished");
  });

  it("mentions session ending between iterations", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("NEW session");
    expect(prompt).toContain("conversation history");
  });

  it("uses the configured loop max minutes", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 15,
    });

    expect(prompt).toContain("15 minutes");
  });

  it("appends user system prompt when provided", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      userSystemPrompt: "Always use TypeScript",
    });

    expect(prompt).toContain("Always use TypeScript");
    expect(prompt).toContain("autonomous agent");
    expect(prompt).toContain("do stuff");
  });

  it("includes loop summary instructions", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("summary");
    expect(prompt).toContain("Code coverage");
    expect(prompt).toContain("Cyclomatic complexity");
    expect(prompt).toContain("Linter warnings");
    expect(prompt).toContain("PRIMARY quality signals");
    expect(prompt).toContain("Next iteration tasks, ordered by priority");
    expect(prompt).toContain("URGENT");
    expect(prompt).toContain("HIGH");
    expect(prompt).toContain("MEDIUM");
  });

  it("includes termination instruction", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("=== ITERATION COMPLETE ===");
    expect(prompt).toContain("Do NOT wait for further input");
    expect(prompt).toContain("WHEN TO END AN ITERATION");
    expect(prompt).toContain("committed");
  });

  it("prevents premature iteration completion", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("Do NOT output the marker just because");
    expect(prompt).toContain("nothing left to do");
    expect(prompt).toContain("ALWAYS more work");
    expect(prompt).toContain("Coverage is below 100%");
    expect(prompt).toContain("cyclomatic complexity above 10");
    expect(prompt).toContain("MUST attempt at least one change per iteration");
  });

  it("includes test execution strategy instructions", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("TEST EXECUTION STRATEGY");
    expect(prompt).toContain("NEVER run the full test suite as your first step");
    expect(prompt).toContain("specific test file(s) related to your current changes");
    expect(prompt).toContain("URGENT for the next iteration");
  });

  it("includes urgent items in progress file instructions", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      progressFilePath: "/tmp/progress.md",
    });

    expect(prompt).toContain("URGENT items");
    expect(prompt).toContain("MUST address URGENT");
  });

  it("includes tool check section on first iteration", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      isFirstIteration: true,
    });

    expect(prompt).toContain("FIRST ITERATION SETUP");
    expect(prompt).toContain("installed AND working");
    expect(prompt).toContain("Code coverage tool");
    expect(prompt).toContain("Cyclomatic complexity analyzer");
    expect(prompt).toContain("Linter");
    expect(prompt).toContain("run a real command");
    expect(prompt).toContain("CREATE one");
    expect(prompt).toContain("=== EXIT ===");
    expect(prompt).toContain("stop the entire application");
  });

  it("excludes tool check section on subsequent iterations", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      isFirstIteration: false,
    });

    expect(prompt).not.toContain("FIRST ITERATION SETUP");
  });

  it("excludes tool check section when isFirstIteration is undefined", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).not.toContain("FIRST ITERATION SETUP");
  });

  it("emphasizes complexity as equally important to coverage", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).toContain("Coverage AND cyclomatic complexity are BOTH PRIMARY");
    expect(prompt).toContain("MUST measure and report BOTH metrics");
    expect(prompt).toContain("Refactor complex functions");
    expect(prompt).toContain("MANDATORY COMPLEXITY CHECK");
    expect(prompt).toContain("MUST run a cyclomatic complexity tool EVERY iteration");
    expect(prompt).toContain("iteration is considered a FAILURE");
  });

  it("includes work dir instructions when workDir is provided", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      workDir: "/project/.solito/commands/quality",
    });

    expect(prompt).toContain("TEMPORARY FILES");
    expect(prompt).toContain("/project/.solito/commands/quality");
    expect(prompt).toContain("NEVER create temporary files in the project root");
  });

  it("excludes work dir instructions when workDir is not provided", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
    });

    expect(prompt).not.toContain("TEMPORARY FILES");
  });

  it("does not append empty user system prompt", () => {
    const prompt = buildSystemPrompt({
      userPrompt: "do stuff",
      loopMaxMinutes: 5,
      userSystemPrompt: undefined,
    });

    const lines = prompt.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);
  });
});
