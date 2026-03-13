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
    expect(prompt).toContain("Current loop metrics");
    expect(prompt).toContain("Overall metrics");
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
