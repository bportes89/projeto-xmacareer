import { EventEmitter } from "events";

type ProjectUpdatedEvent = { projectId: string; updatedAt: string };

const globalForRealtime = globalThis as unknown as { projectEvents?: EventEmitter };

const emitter =
  globalForRealtime.projectEvents ??
  (() => {
    const e = new EventEmitter();
    e.setMaxListeners(1000);
    return e;
  })();

if (process.env.NODE_ENV !== "production") globalForRealtime.projectEvents = emitter;

export function publishProjectUpdated(projectId: string, updatedAt: string) {
  emitter.emit(`project:${projectId}`, { projectId, updatedAt } satisfies ProjectUpdatedEvent);
}

export function subscribeProjectUpdated(projectId: string, handler: (evt: ProjectUpdatedEvent) => void) {
  const key = `project:${projectId}`;
  emitter.on(key, handler);
  return () => emitter.off(key, handler);
}

