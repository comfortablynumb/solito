import { TerminalMarkdownRenderer } from "./markdown-renderer";

describe("TerminalMarkdownRenderer", () => {
  const renderer = new TerminalMarkdownRenderer();

  it("renders bold text with ANSI codes", () => {
    const result = renderer.render("This is **bold** text");
    expect(result).toContain("bold");
    expect(result).toContain("\x1b[1m");
  });

  it("renders inline code with ANSI codes", () => {
    const result = renderer.render("Use `npm test` to run");
    expect(result).toContain("npm test");
  });

  it("renders bullet lists", () => {
    const result = renderer.render("- item one\n- item two");
    expect(result).toContain("item one");
    expect(result).toContain("item two");
  });

  it("renders bold inside list items", () => {
    const result = renderer.render("- **bold**: description");
    expect(result).toContain("\x1b[1m");
    expect(result).not.toContain("**bold**");
  });

  it("renders inline code inside list items", () => {
    const result = renderer.render("- Use `command` here");
    expect(result).not.toContain("`command`");
  });

  it("trims trailing newlines to single newline", () => {
    const result = renderer.render("hello");
    expect(result).toMatch(/\n$/);
    expect(result).not.toMatch(/\n\n$/);
  });

  it("returns plain text for empty input", () => {
    const result = renderer.render("");
    expect(typeof result).toBe("string");
  });
});
