import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseDateOnly } from "../lib/dates";
import { publicTask } from "../lib/serialize";
import { ApiError, asyncHandler } from "../middleware/error";
import { userIdOf } from "../middleware/auth";
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from "../schemas";

export const tasksRouter = Router();

// Every query below is filtered by userId taken from the verified token. The
// id in the URL is never trusted on its own -- an update or delete matches on
// (id, userId) together, so naming someone else's task id simply matches zero
// rows and returns 404 rather than touching their data.

tasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { completed } = taskQuerySchema.parse(req.query);

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        ...(completed !== undefined ? { completed: completed === "true" } : {}),
      },
      // Unscheduled ("Someday") tasks sort last; within a day, high priority
      // first. The Today/Upcoming/Someday split itself happens on the client,
      // which is the only side that knows the user's local date.
      orderBy: [
        { completed: "asc" },
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { createdAt: "asc" },
      ],
    });

    res.json({ tasks: tasks.map(publicTask) });
  }),
);

tasksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const input = createTaskSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        userId,
        title: input.title,
        notes: input.notes ?? null,
        dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
        priority: input.priority,
      },
    });

    res.status(201).json({ task: publicTask(task) });
  }),
);

tasksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const patch = updateTaskSchema.parse(req.body);

    // Only copy across keys the client actually sent. Spreading the parsed
    // object directly would write `undefined` over columns it never mentioned.
    const data: Prisma.TaskUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.dueDate !== undefined) {
      data.dueDate = patch.dueDate === null ? null : parseDateOnly(patch.dueDate);
    }
    if (patch.completed !== undefined) {
      data.completed = patch.completed;
      data.completedAt = patch.completed ? new Date() : null;
    }

    const { count } = await prisma.task.updateMany({
      where: { id: req.params.id, userId },
      data,
    });
    if (count === 0) throw ApiError.notFound("Task not found");

    const task = await prisma.task.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json({ task: publicTask(task) });
  }),
);

tasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);

    const { count } = await prisma.task.deleteMany({
      where: { id: req.params.id, userId },
    });
    if (count === 0) throw ApiError.notFound("Task not found");

    res.status(204).end();
  }),
);
