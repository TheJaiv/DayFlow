import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { addDays, formatDateOnly, parseDateOnly, todayUtc } from "../lib/dates";
import { computeDailyStreak } from "../lib/streaks";
import { publicHabit } from "../lib/serialize";
import { ApiError, asyncHandler } from "../middleware/error";
import { userIdOf } from "../middleware/auth";
import {
  createHabitSchema,
  habitQuerySchema,
  logHabitSchema,
  streakQuerySchema,
  updateHabitSchema,
} from "../schemas";

export const habitsRouter = Router();

const GRID_DAYS = 7;

/**
 * HabitLog has no userId of its own -- ownership runs through Habit. So every
 * log route starts here, and a habit belonging to somebody else is
 * indistinguishable from one that does not exist.
 */
async function findOwnedHabit(habitId: string, userId: string) {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId } });
  if (!habit) throw ApiError.notFound("Habit not found");
  return habit;
}

/** The 7 boxes the UI draws, oldest first, ending on the client's today. */
function buildGrid(completed: Set<string>, today: string) {
  return Array.from({ length: GRID_DAYS }, (_, i) => {
    const date = addDays(today, i - (GRID_DAYS - 1));
    return { date, completed: completed.has(date) };
  });
}

habitsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const query = habitQuerySchema.parse(req.query);
    const today = query.today ?? todayUtc();

    const habits = await prisma.habit.findMany({
      where: {
        userId,
        ...(query.includeArchived === "true" ? {} : { archived: false }),
      },
      orderBy: { createdAt: "asc" },
    });

    // One query for every habit's logs rather than one per habit -- the list
    // screen would otherwise fire N+1 round trips at a pooled remote database.
    const logs = habits.length
      ? await prisma.habitLog.findMany({
          where: { habitId: { in: habits.map((h) => h.id) }, completed: true },
          select: { habitId: true, date: true },
        })
      : [];

    const completedByHabit = new Map<string, Set<string>>();
    for (const log of logs) {
      let set = completedByHabit.get(log.habitId);
      if (!set) completedByHabit.set(log.habitId, (set = new Set()));
      set.add(formatDateOnly(log.date));
    }

    res.json({
      today,
      habits: habits.map((habit) => {
        const completed = completedByHabit.get(habit.id) ?? new Set<string>();
        return {
          ...publicHabit(habit),
          streak: computeDailyStreak([...completed], today),
          grid: buildGrid(completed, today),
        };
      }),
    });
  }),
);

habitsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const input = createHabitSchema.parse(req.body);

    const habit = await prisma.habit.create({
      data: {
        userId,
        name: input.name,
        frequency: input.frequency,
        targetDays: input.targetDays,
        colorTag: input.colorTag,
      },
    });

    res.status(201).json({
      habit: {
        ...publicHabit(habit),
        streak: computeDailyStreak([], todayUtc()),
        grid: buildGrid(new Set(), todayUtc()),
      },
    });
  }),
);

habitsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const patch = updateHabitSchema.parse(req.body);

    const data: Prisma.HabitUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.frequency !== undefined) data.frequency = patch.frequency;
    if (patch.targetDays !== undefined) data.targetDays = patch.targetDays;
    if (patch.colorTag !== undefined) data.colorTag = patch.colorTag;
    if (patch.archived !== undefined) data.archived = patch.archived;

    const { count } = await prisma.habit.updateMany({
      where: { id: req.params.id, userId },
      data,
    });
    if (count === 0) throw ApiError.notFound("Habit not found");

    const habit = await prisma.habit.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json({ habit: publicHabit(habit) });
  }),
);

habitsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);

    // HabitLog rows go with it via onDelete: Cascade in the schema.
    const { count } = await prisma.habit.deleteMany({
      where: { id: req.params.id, userId },
    });
    if (count === 0) throw ApiError.notFound("Habit not found");

    res.status(204).end();
  }),
);

/** Toggle (or explicitly set) one day's completion. */
habitsRouter.post(
  "/:id/log",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const habit = await findOwnedHabit(req.params.id, userId);
    const input = logHabitSchema.parse(req.body);

    const date = parseDateOnly(input.date);
    const key = { habitId_date: { habitId: habit.id, date } };

    let nextValue: boolean;
    if (input.completed !== undefined) {
      nextValue = input.completed;
    } else {
      const existing = await prisma.habitLog.findUnique({ where: key });
      nextValue = !existing?.completed;
    }

    // Upsert against the (habitId, date) unique index, so a double-tap or a
    // retried request converges on one row instead of racing to insert two.
    const log = await prisma.habitLog.upsert({
      where: key,
      create: { habitId: habit.id, date, completed: nextValue },
      update: { completed: nextValue },
    });

    const today = input.today ?? todayUtc();
    const completedLogs = await prisma.habitLog.findMany({
      where: { habitId: habit.id, completed: true },
      select: { date: true },
    });
    const completed = new Set(completedLogs.map((l) => formatDateOnly(l.date)));

    res.json({
      log: { date: formatDateOnly(log.date), completed: log.completed },
      streak: computeDailyStreak([...completed], today),
      grid: buildGrid(completed, today),
    });
  }),
);

habitsRouter.get(
  "/:id/streak",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const habit = await findOwnedHabit(req.params.id, userId);
    const { today } = streakQuerySchema.parse(req.query);
    const reference = today ?? todayUtc();

    const completedLogs = await prisma.habitLog.findMany({
      where: { habitId: habit.id, completed: true },
      select: { date: true },
    });
    const completed = new Set(completedLogs.map((l) => formatDateOnly(l.date)));

    res.json({
      habitId: habit.id,
      today: reference,
      streak: computeDailyStreak([...completed], reference),
      grid: buildGrid(completed, reference),
    });
  }),
);
