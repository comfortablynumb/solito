import { DefaultStreamingSpawner } from "./default-streaming-spawner";

describe("DefaultStreamingSpawner", () => {
  const spawner = new DefaultStreamingSpawner();

  beforeEach(() => {
    jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls onLine for each line of stdout", async () => {
    const lines: string[] = [];
    const script = 'process.stdout.write("line1\\nline2\\nline3\\n")';

    const handle = spawner.spawn({
      command: "node",
      args: ["-e", script],
      onLine: (line) => lines.push(line),
    });

    await handle.result;

    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("captures full stdout in result", async () => {
    const script = 'process.stdout.write("hello\\nworld\\n")';

    const handle = spawner.spawn({
      command: "node",
      args: ["-e", script],
      onLine: () => {},
    });

    const result = await handle.result;

    expect(result.stdout).toBe("hello\nworld\n");
  });

  it("captures stderr in result", async () => {
    const script = 'process.stderr.write("err msg")';

    const handle = spawner.spawn({
      command: "node",
      args: ["-e", script],
      onLine: () => {},
    });

    const result = await handle.result;

    expect(result.stderr).toBe("err msg");
  });

  it("returns correct exit code", async () => {
    const handle = spawner.spawn({
      command: "node",
      args: ["-e", "process.exit(3)"],
      onLine: () => {},
    });

    const result = await handle.result;

    expect(result.exitCode).toBe(3);
  });

  it("flushes unterminated trailing data", async () => {
    const lines: string[] = [];
    const script = 'process.stdout.write("line1\\ntrailing")';

    const handle = spawner.spawn({
      command: "node",
      args: ["-e", script],
      onLine: (line) => lines.push(line),
    });

    await handle.result;

    expect(lines).toEqual(["line1", "trailing"]);
  });

  it("flushes whitespace-only trailing buffer", async () => {
    const lines: string[] = [];
    const script = 'process.stdout.write("line1\\n  ")';

    const handle = spawner.spawn({
      command: "node",
      args: ["-e", script],
      onLine: (line) => lines.push(line),
    });

    await handle.result;

    expect(lines).toEqual(["line1", "  "]);
  });

  it("rejects on nonexistent command", async () => {
    const handle = spawner.spawn({
      command: "nonexistent-command-xyz",
      args: [],
      onLine: () => {},
    });

    await expect(handle.result).rejects.toThrow(/Failed to start "nonexistent-command-xyz"/);
  });
});
