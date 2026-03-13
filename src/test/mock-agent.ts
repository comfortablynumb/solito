import { Agent, AgentResult } from "../agents/agent";
import { createMockChild } from "./mock-child-process";

export function createMockAgent(result: AgentResult, available = true): Agent {
  const child = createMockChild();
  const stopResult: AgentResult = { exitCode: 1, stdout: "", stderr: "" };

  return {
    name: "mock-agent",
    run: jest.fn()
      .mockReturnValueOnce({ child, result: Promise.resolve(result) })
      .mockReturnValue({ child, result: Promise.resolve(stopResult) }),
    isAvailable: jest.fn().mockResolvedValue(available),
  };
}

export function createSequenceMockAgent(
  results: AgentResult[],
  available = true,
): Agent {
  const child = createMockChild();
  const mock = jest.fn();

  for (const result of results) {
    mock.mockReturnValueOnce({ child, result: Promise.resolve(result) });
  }

  const stopResult: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
  mock.mockReturnValue({ child, result: Promise.resolve(stopResult) });

  return {
    name: "mock-agent",
    run: mock,
    isAvailable: jest.fn().mockResolvedValue(available),
  };
}
