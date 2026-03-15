import { JsonStreamParser } from "./parser";

describe("JsonStreamParser", () => {
  const silentLogger = { warn: () => {} };
  const parser = new JsonStreamParser(silentLogger);

  it("parses valid JSON line into CliMessage", () => {
    const line = '{"type":"stream_event","event":{"type":"ping"}}';
    const result = parser.parseLine(line);

    expect(result).toEqual({
      type: "stream_event",
      event: { type: "ping" },
    });
  });

  it("returns null for empty lines", () => {
    expect(parser.parseLine("")).toBeNull();
    expect(parser.parseLine("   ")).toBeNull();
  });

  it("returns null and logs warning for invalid JSON", () => {
    const logger = { warn: jest.fn() };
    const parserWithLogger = new JsonStreamParser(logger);

    expect(parserWithLogger.parseLine("not json")).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("not json"),
    );
  });

  it("returns null for broken JSON", () => {
    expect(parser.parseLine("{broken")).toBeNull();
  });

  it("trims whitespace before parsing", () => {
    const line = '  {"type":"ping"}  ';
    const result = parser.parseLine(line);
    expect(result).toEqual({ type: "ping" });
  });

  it("parses content_block_delta with text_delta", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      },
    });

    const result = parser.parseLine(line);

    expect(result).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      },
    });
  });

  it("truncates long lines in error preview", () => {
    const logger = { warn: jest.fn() };
    const parserWithLogger = new JsonStreamParser(logger);
    const longLine = "x".repeat(200);

    parserWithLogger.parseLine(longLine);

    const warning = logger.warn.mock.calls[0][0] as string;
    expect(warning).toContain("...");
    expect(warning.length).toBeLessThan(longLine.length + 50);
  });

  it("does not truncate short lines in error preview", () => {
    const logger = { warn: jest.fn() };
    const parserWithLogger = new JsonStreamParser(logger);
    const shortLine = "not json";

    parserWithLogger.parseLine(shortLine);

    const warning = logger.warn.mock.calls[0][0] as string;
    expect(warning).not.toContain("...");
    expect(warning).toContain("not json");
  });

  it("uses default logger when none provided", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    const defaultParser = new JsonStreamParser();

    defaultParser.parseLine("bad json");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("bad json"));
    spy.mockRestore();
  });

  it("parses result message", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      cost_usd: 0.0123,
    });

    const result = parser.parseLine(line);

    expect(result).toEqual({
      type: "result",
      subtype: "success",
      cost_usd: 0.0123,
    });
  });
});
