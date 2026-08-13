import type { Habit, Task, TimetableEvent, User } from "@prisma/client";
import { formatDateOnly } from "./dates";

// Prisma models go over the wire through these, never directly. Two reasons:
// passwordHash must never reach a client, and @db.Date columns come back as
// Date objects that JSON.stringify would render as full ISO timestamps --
// turning "2026-08-13" into "2026-08-13T00:00:00.000Z" and inviting the client
// to re-parse it in local time and land on the 12th.

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

export function publicTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    dueDate: task.dueDate ? formatDateOnly(task.dueDate) : null,
    priority: task.priority,
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function publicEvent(event: TimetableEvent) {
  return {
    id: event.id,
    title: event.title,
    date: formatDateOnly(event.date),
    startMinute: event.startMinute,
    endMinute: event.endMinute,
    colorTag: event.colorTag,
    notes: event.notes,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export function publicHabit(habit: Habit) {
  return {
    id: habit.id,
    name: habit.name,
    frequency: habit.frequency,
    targetDays: habit.targetDays,
    colorTag: habit.colorTag,
    archived: habit.archived,
    createdAt: habit.createdAt.toISOString(),
  };
}
