// Per-engagement serialization for live-mode capture. Live fragments are
// submitted in quick succession during a real conversation and each one's
// entity resolution depends on reading what the previous fragment just
// wrote (§9.2 — "the recon platform" resolving to an existing System only
// works if that System has actually landed in the EKB yet). Running them
// concurrently races: fragment 2's read of existing entities can start
// before fragment 1's write commits, so it never sees what fragment 1 just
// created and ends up duplicating it. Queuing per engagement fixes that
// without needing a distributed lock — this is a single-process dev/small
// deployment; a multi-instance deployment would need a DB-backed lock here.
const queues = new Map<string, Promise<unknown>>();

export function runExclusive<T>(engagementId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(engagementId) ?? Promise.resolve();
  const next = previous.then(task, task);
  // swallow rejections in the chain so one failed fragment doesn't jam the
  // queue for the ones after it
  queues.set(
    engagementId,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}
