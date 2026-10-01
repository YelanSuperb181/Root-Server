// Scheduled work via Root's job scheduler (persisted in the Bot's data file,
// so schedules survive restarts). Jobs are routed to handlers by tag.

import { rootServer, JobData, JobInterval, JobScheduleEvent } from "@rootsdk/server-bot";
import { nextDailyRun } from "../logic/dates";
import { errMessage, log } from "./log";

type Handler = (resourceId: string) => Promise<void>;

const handlers = new Map<string, Handler>();
const DAILY_TAG = "daily";

export function onJob(tag: string, handler: Handler): void {
  handlers.set(tag, handler);
}

async function dispatch(job: JobData, missed: boolean): Promise<void> {
  const handler = job.tag ? handlers.get(job.tag) : undefined;
  if (!handler) return;
  try {
    // A missed job (the Bot was offline) still runs; handlers make sure the
    // same day or poll is never handled twice.
    if (missed) log("info", `running missed job ${job.tag}`, { resourceId: job.resourceId });
    await handler(job.resourceId);
  } catch (err) {
    log("error", `job ${job.tag} failed`, { error: errMessage(err) });
  }
}

export function initJobs(): void {
  rootServer.jobScheduler.on(JobScheduleEvent.Job, (job: JobData) => void dispatch(job, false));
  rootServer.jobScheduler.on(JobScheduleEvent.JobMissed, (job: JobData) => void dispatch(job, true));
}

/** Keeps exactly one daily job at the configured hour. */
export async function ensureDailyJob(hourUtc: number, handler: Handler): Promise<void> {
  onJob(DAILY_TAG, handler);
  const want = `daily-at-${hourUtc}`;
  const existing = await rootServer.jobScheduler.listByTag(DAILY_TAG);
  for (const job of existing) {
    if (job.resourceId !== want) await rootServer.jobScheduler.delete(job.jobScheduleId);
  }
  if (!existing.some((job) => job.resourceId === want)) {
    await rootServer.jobScheduler.create({
      resourceId: want,
      tag: DAILY_TAG,
      start: nextDailyRun(Date.now(), hourUtc),
      jobInterval: JobInterval.Daily,
    });
    log("info", `daily job scheduled for ${hourUtc}:00 UTC`);
  }
}

export async function scheduleOnce(tag: string, resourceId: string, at: Date): Promise<void> {
  await rootServer.jobScheduler.create({ resourceId, tag, start: at, jobInterval: JobInterval.OneTime });
}

export async function cancelJobs(resourceId: string): Promise<void> {
  await rootServer.jobScheduler.deleteByResourceId(resourceId);
}
