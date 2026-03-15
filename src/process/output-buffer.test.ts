import { OutputBuffer } from "./output-buffer";

describe("OutputBuffer", () => {
  it("accumulates appended text", () => {
    const buf = new OutputBuffer();
    buf.append("hello ");
    buf.append("world");

    expect(buf.toString()).toBe("hello world");
  });

  it("truncates output beyond max bytes", () => {
    const buf = new OutputBuffer(10);
    buf.append("12345");
    buf.append("67890");
    buf.append("extra");

    const result = buf.toString();
    expect(result).toContain("[output truncated");
    expect(result.length).toBeLessThan(100);
  });

  it("stops accumulating after truncation", () => {
    const buf = new OutputBuffer(5);
    buf.append("12345");
    buf.append("more data");
    buf.append("even more");

    const result = buf.toString();
    expect(result).toContain("12345");
    expect(result).not.toContain("more data");
  });

  it("returns empty string when nothing appended", () => {
    const buf = new OutputBuffer();

    expect(buf.toString()).toBe("");
  });
});
