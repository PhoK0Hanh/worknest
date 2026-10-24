type SummaryTask = { status: string; dueAt: Date | null };

export function summarizeTasks<T extends SummaryTask>(tasks: T[], now: Date) {
  const upcomingEnd = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const unfinished = tasks.filter(task => task.status !== "DONE");
  // Overdue first, then upcoming deadlines within seven days; completed work never needs attention.
  const attention = unfinished.filter(task => task.dueAt && task.dueAt.getTime() <= upcomingEnd)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime()).slice(0, 5);
  return {
    total: tasks.length,
    done: tasks.filter(task => task.status === "DONE").length,
    inProgress: tasks.filter(task => task.status === "IN_PROGRESS").length,
    todo: tasks.filter(task => task.status === "TODO").length,
    overdue: unfinished.filter(task => task.dueAt && task.dueAt < now).length,
    attention,
    asOf: now,
  };
}
