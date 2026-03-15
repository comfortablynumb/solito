import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

export interface MockStdin {
  write: jest.Mock;
  destroyed: boolean;
}

export function createMockChild(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  (child as unknown as { killed: boolean }).killed = false;
  (child as unknown as { pid: number }).pid = 99999;
  child.kill = jest.fn().mockReturnValue(true);

  const stdin: MockStdin = { write: jest.fn(), destroyed: false };
  (child as unknown as { stdin: MockStdin }).stdin = stdin;

  return child;
}
