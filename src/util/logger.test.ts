import { ConsoleLogger } from "./logger";

describe("ConsoleLogger", () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
    logger = new ConsoleLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("delegates info to console.log", () => {
    logger.info("hello");
    expect(console.log).toHaveBeenCalledWith("hello");
  });

  it("delegates warn to console.warn", () => {
    logger.warn("caution");
    expect(console.warn).toHaveBeenCalledWith("caution");
  });

  it("delegates error to console.error", () => {
    logger.error("failure");
    expect(console.error).toHaveBeenCalledWith("failure");
  });
});
