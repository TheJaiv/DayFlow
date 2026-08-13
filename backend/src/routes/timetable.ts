import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseDateOnly } from "../lib/dates";
import { publicEvent } from "../lib/serialize";
import { ApiError, asyncHandler } from "../middleware/error";
import { userIdOf } from "../middleware/auth";
import {
  createEventSchema,
  timetableQuerySchema,
  updateEventSchema,
} from "../schemas";

export const timetableRouter = Router();

timetableRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { date, from, to } = timetableQuerySchema.parse(req.query);

    // `date` fetches one day; `from`/`to` fetch a range, which is what the day
    // view uses to prefetch neighbours so swiping between days is instant.
    let dateFilter: Prisma.DateTimeFilter | Date | undefined;
    if (date) {
      dateFilter = parseDateOnly(date);
    } else if (from || to) {
      dateFilter = {
        ...(from ? { gte: parseDateOnly(from) } : {}),
        ...(to ? { lte: parseDateOnly(to) } : {}),
      };
    }

    const events = await prisma.timetableEvent.findMany({
      where: { userId, ...(dateFilter ? { date: dateFilter } : {}) },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    });

    res.json({ events: events.map(publicEvent) });
  }),
);

timetableRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const input = createEventSchema.parse(req.body);

    const event = await prisma.timetableEvent.create({
      data: {
        userId,
        title: input.title,
        date: parseDateOnly(input.date),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        colorTag: input.colorTag,
        notes: input.notes ?? null,
      },
    });

    res.status(201).json({ event: publicEvent(event) });
  }),
);

timetableRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const patch = updateEventSchema.parse(req.body);

    const existing = await prisma.timetableEvent.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) throw ApiError.notFound("Event not found");

    // A PATCH can move just one edge of the block, so the ordering rule has to
    // be checked against the merged result. Validating the patch alone would
    // happily accept a start of 14:00 against a stored end of 10:00.
    const startMinute = patch.startMinute ?? existing.startMinute;
    const endMinute = patch.endMinute ?? existing.endMinute;
    if (endMinute <= startMinute) {
      throw ApiError.badRequest("End time must be after start time", [
        { field: "endMinute", message: "End time must be after start time" },
      ]);
    }

    const data: Prisma.TimetableEventUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.colorTag !== undefined) data.colorTag = patch.colorTag;
    if (patch.startMinute !== undefined) data.startMinute = patch.startMinute;
    if (patch.endMinute !== undefined) data.endMinute = patch.endMinute;
    if (patch.date !== undefined) data.date = parseDateOnly(patch.date);

    const event = await prisma.timetableEvent.update({
      where: { id: existing.id },
      data,
    });

    res.json({ event: publicEvent(event) });
  }),
);

timetableRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);

    const { count } = await prisma.timetableEvent.deleteMany({
      where: { id: req.params.id, userId },
    });
    if (count === 0) throw ApiError.notFound("Event not found");

    res.status(204).end();
  }),
);
