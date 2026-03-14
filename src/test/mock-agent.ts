import { Agent, AgentResult } from "../agents/agent";
import { createMockChild } from "./mock-child-process";

function mockHandle(result: AgentResult) {
  const child = createMockChild();
  return {
    child,
    result: Promise.resolve(result),
    iterationComplete: { value: false },
    exitRequested: { value: false },
  };
}

export function createMockAgent(result: AgentResult, available = true): Agent {
  const stopResult: AgentResult = { exitCode: 1, stdout: "", stderr: "" };

  return {
    name: "mock-agent",
    run: jest.fn()
      .mockReturnValueOnce(mockHandle(result))
      .mockReturnValue(mockHandle(stopResult)),
    isAvailable: jest.fn().mockResolvedValue(available),
  };
}

export function createSequenceMockAgent(
  results: AgentResult[],
  available = true,
): Agent {
  const mock = jest.fn();

  for (const result of results) {
    mock.mockReturnValueOnce(mockHandle(result));
  }

  const stopResult: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
  mock.mockReturnValue(mockHandle(stopResult));

  return {
    name: "mock-agent",
    run: mock,
    isAvailable: jest.fn().mockResolvedValue(available),
  };
}
