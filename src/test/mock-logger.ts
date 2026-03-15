import { Logger } from "../util/logger";

export function createMockLogger(): Logger & {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
} {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
