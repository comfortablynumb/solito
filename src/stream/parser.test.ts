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
