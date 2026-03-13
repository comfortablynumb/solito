import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

export function createMockChild(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  (child as unknown as { killed: boolean }).killed = false;
  (child as unknown as { pid: number }).pid = 99999;
  child.kill = jest.fn().mockReturnValue(true);
  return child;
}
