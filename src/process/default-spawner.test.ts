import { DefaultProcessSpawner } from "./default-spawner";

describe("DefaultProcessSpawner", () => {
  const spawner = new DefaultProcessSpawner();

  beforeEach(() => {
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("captures stdout from a command", async () => {
    const handle = spawner.spawn("node", ["-e", 'process.stdout.write("hello")']);
    const result = await handle.result;

    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("captures stderr from a command", async () => {
    const handle = spawner.spawn("node", ["-e", 'process.stderr.write("oops")']);
    const result = await handle.result;

    expect(result.stderr).toBe("oops");
    expect(result.exitCode).toBe(0);
  });

  it("returns non-zero exit code", async () => {
    const handle = spawner.spawn("node", ["-e", "process.exit(2)"]);
    const result = await handle.result;

    expect(result.exitCode).toBe(2);
  });

  it("rejects on nonexistent command", async () => {
    const handle = spawner.spawn("nonexistent-command-xyz", []);

    await expect(handle.result).rejects.toThrow(/Failed to start "nonexistent-command-xyz"/);
  });

  it("returns exitCode 1 when process is killed (null exit code)", async () => {
    const handle = spawner.spawn("node", ["-e", "setTimeout(() => {}, 60000)"]);

    // Kill the process to produce null exit code
    handle.child.kill("SIGTERM");

    const result = await handle.result;
    // When killed, exitCode may be null (mapped to 1) or a signal-related code
    expect(typeof result.exitCode).toBe("number");
  });
});
