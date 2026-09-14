import * as os from 'node:os';
import { threadId as workerThreadId } from 'node:worker_threads';
import * as cluster from 'node:cluster';

interface EnvironmentDescriptor {
  readonly pid: number;
  readonly workerId: number;
  readonly pmId: string | undefined;
  readonly clusterId: string | undefined;
  readonly hostname: string;
}

function readEnvironment(): EnvironmentDescriptor {
  const pmId = process.env.pm_id;
  const isClusterWorker =
    typeof cluster === 'object' &&
    cluster !== null &&
    'isWorker' in cluster &&
    typeof (cluster as { isWorker: boolean }).isWorker === 'boolean'
      ? (cluster as { isWorker: boolean }).isWorker
      : false;

  const clusterWorkerId = isClusterWorker
    ? String(
        (cluster as { worker?: { id?: number } }).worker?.id ?? '',
      )
    : undefined;

  return {
    pid: process.pid,
    workerId: workerThreadId,
    pmId: pmId !== undefined && pmId !== '' ? pmId : undefined,
    clusterId:
      clusterWorkerId !== undefined && clusterWorkerId !== ''
        ? clusterWorkerId
        : undefined,
    hostname: os.hostname(),
  };
}

const cached = readEnvironment();

export const EnvironmentInfo = {
  get pid(): number {
    return cached.pid;
  },
  get workerId(): number {
    return cached.workerId;
  },
  get pmId(): string | undefined {
    return cached.pmId;
  },
  get clusterId(): string | undefined {
    return cached.clusterId;
  },
  get hostname(): string {
    return cached.hostname;
  },
  get nodeId(): string {
    const parts: string[] = [];
    if (cached.pmId !== undefined) {
      parts.push(`pm${cached.pmId}`);
    } else if (cached.clusterId !== undefined) {
      parts.push(`c${cached.clusterId}`);
    }
    parts.push(cached.hostname);
    parts.push(String(cached.pid));
    if (cached.workerId > 0) {
      parts.push(`w${cached.workerId}`);
    }
    return parts.join(':');
  },
} as const;