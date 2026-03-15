export interface MetricReport {
  instanceId: string;
  command: string;
  project: string;
  timestamp: string;
  loop: number;
  status: string;
  metrics: Record<string, number>;
  description: string;
  commit?: string;
}

export interface InstanceInfo {
  instanceId: string;
  command: string;
  project: string;
  firstSeen: string;
  lastSeen: string;
  reportCount: number;
}

export interface MetricsStore {
  add(report: MetricReport): void;
  getAll(): MetricReport[];
  getByCommand(command: string): MetricReport[];
  getByInstance(instanceId: string): MetricReport[];
  getInstances(): InstanceInfo[];
}

export class InMemoryMetricsStore implements MetricsStore {
  private readonly reports: MetricReport[] = [];

  add(report: MetricReport): void {
    this.reports.push(report);
  }

  getAll(): MetricReport[] {
    return [...this.reports];
  }

  getByCommand(command: string): MetricReport[] {
    return this.reports.filter((r) => r.command === command);
  }

  getByInstance(instanceId: string): MetricReport[] {
    return this.reports.filter((r) => r.instanceId === instanceId);
  }

  getInstances(): InstanceInfo[] {
    const map = new Map<string, InstanceInfo>();

    for (const r of this.reports) {
      const existing = map.get(r.instanceId);

      if (existing) {
        existing.lastSeen = r.timestamp;
        existing.reportCount++;
      } else {
        map.set(r.instanceId, {
          instanceId: r.instanceId,
          command: r.command,
          project: r.project,
          firstSeen: r.timestamp,
          lastSeen: r.timestamp,
          reportCount: 1,
        });
      }
    }

    return Array.from(map.values());
  }
}
