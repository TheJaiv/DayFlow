import { z } from "zod";
import { DATE_ONLY_RE } from "../lib/dates";

const dateOnly = z.string().regex(DATE_ONLY_RE, "Expected a YYYY-MM-DD date");
const minuteOfDay = z.number().int().min(0).max(1439);

/* -------------------------------------------------------------- auth ---- */

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/* ------------------------------------------------------------- tasks ---- */

const taskFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().max(2000).nullish(),
  // Null due date is meaningful: it puts the task in the "Someday" group.
  dueDate: dateOnly.nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const createTaskSchema = taskFields;

export const updateTaskSchema = taskFields
  .partial()
  .extend({ completed: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const taskQuerySchema = z.object({
  completed: z.enum(["true", "false"]).optional(),
});

/* --------------------------------------------------------- timetable ---- */

const eventFields = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  date: dateOnly,
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  colorTag: z.string().trim().min(1).max(20).default("blue"),
  notes: z.string().max(2000).nullish(),
});

export const createEventSchema = eventFields.refine(
  (data) => data.endMinute > data.startMinute,
  { message: "End time must be after start time", path: ["endMinute"] },
);

// A PATCH may send only one end of the range, so the ordering check cannot
// happen here -- it runs in the route once the patch is merged with the row
// already in the database.
export const updateEventSchema = eventFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const timetableQuerySchema = z
  .object({
    date: dateOnly.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: "`from` must not be after `to`",
    path: ["from"],
  });

/* ------------------------------------------------------------ habits ---- */

const habitFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // v1 only creates DAILY habits; WEEKDAYS is accepted so the API does not
  // need a breaking change when the UI grows a day picker.
  frequency: z.enum(["DAILY", "WEEKDAYS"]).default("DAILY"),
  targetDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  colorTag: z.string().trim().min(1).max(20).default("green"),
});

export const createHabitSchema = habitFields;

export const updateHabitSchema = habitFields
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const logHabitSchema = z.object({
  date: dateOnly,
  // Omit to toggle whatever the day currently is; send explicitly to force a
  // value. Explicit wins because a retry after a flaky connection should be
  // idempotent rather than flipping the day back.
  completed: z.boolean().optional(),
  // The client's local today, so the streak returned alongside the toggle is
  // measured from the user's calendar rather than the server's.
  today: dateOnly.optional(),
});

export const habitQuerySchema = z.object({
  today: dateOnly.optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

export const streakQuerySchema = z.object({ today: dateOnly.optional() });
