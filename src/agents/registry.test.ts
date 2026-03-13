import { getAgent, listAgentNames } from "./registry";

describe("registry", () => {
  describe("getAgent", () => {
    it("returns claude agent", () => {
      const agent = getAgent("claude");
      expect(agent.name).toBe("claude");
    });

    it("returns codex agent", () => {
      const agent = getAgent("codex");
      expect(agent.name).toBe("codex");
    });

    it("throws for unknown agent", () => {
      expect(() => getAgent("unknown")).toThrow(
        'Unknown agent "unknown". Available agents: claude, codex'
      );
    });
  });

  describe("listAgentNames", () => {
    it("returns all registered agent names", () => {
      const names = listAgentNames();
      expect(names).toContain("claude");
      expect(names).toContain("codex");
    });
  });
});
