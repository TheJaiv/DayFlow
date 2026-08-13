/**
 * End-to-end API smoke test.
 *
 *   npm run dev          # in one terminal
 *   npm run test:api     # in another
 *
 * Drives the real HTTP surface against the real database. It creates two
 * throwaway users so it can prove the thing that matters most in a
 * multi-tenant app: that user B cannot see or touch user A's rows. Everything
 * it creates is deleted on the way out.
 */

const BASE = process.env.API_URL ?? "http://localhost:4000";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}`);
    if (detail !== undefined) {
      console.log(`        ${JSON.stringify(detail)}`);
    }
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

interface Res<T = any> {
  status: number;
  body: T;
}

async function call<T = any>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; mobile?: boolean } = {},
): Promise<Res<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.mobile) headers["X-Client-Platform"] = "mobile";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const stamp = Date.now();
  const userA = {
    email: `smoke-a-${stamp}@dayflow.test`,
    password: "correct-horse-battery",
    name: "Smoke A",
  };
  const userB = {
    email: `smoke-b-${stamp}@dayflow.test`,
    password: "correct-horse-battery",
    name: "Smoke B",
  };

  console.log(`Testing ${BASE}`);

  /* ------------------------------------------------------------ health -- */
  section("Health");
  const health = await call("GET", "/health");
  check("GET /health returns 200", health.status === 200, health.body);
  if (health.status !== 200) {
    console.error("\nAPI is not reachable. Is `npm run dev` running?");
    process.exit(1);
  }

  /* -------------------------------------------------------------- auth -- */
  section("Auth");

  const signupA = await call("POST", "/auth/signup", { body: userA, mobile: true });
  check("signup returns 201", signupA.status === 201, signupA.body);
  check("signup returns an access token", !!signupA.body?.accessToken);
  check(
    "signup returns a refresh token to mobile clients",
    !!signupA.body?.refreshToken,
  );
  check(
    "signup never leaks passwordHash",
    signupA.body?.user && !("passwordHash" in signupA.body.user),
    signupA.body?.user,
  );

  let tokenA: string = signupA.body?.accessToken;
  const refreshA: string = signupA.body?.refreshToken;

  const dupe = await call("POST", "/auth/signup", { body: userA });
  check("duplicate email is rejected with 409", dupe.status === 409, dupe.body);

  const weak = await call("POST", "/auth/signup", {
    body: { email: `weak-${stamp}@dayflow.test`, password: "short", name: "W" },
  });
  check("password under 8 chars is rejected with 400", weak.status === 400);

  const badEmail = await call("POST", "/auth/signup", {
    body: { email: "not-an-email", password: "longenoughpassword", name: "W" },
  });
  check("malformed email is rejected with 400", badEmail.status === 400);

  const wrongPw = await call("POST", "/auth/login", {
    body: { email: userA.email, password: "wrong-password" },
  });
  check("wrong password returns 401", wrongPw.status === 401, wrongPw.body);
  check(
    "wrong password does not reveal whether the account exists",
    wrongPw.body?.error?.message === "Incorrect email or password",
    wrongPw.body?.error,
  );

  const noSuchUser = await call("POST", "/auth/login", {
    body: { email: `ghost-${stamp}@dayflow.test`, password: "whatever12345" },
  });
  check(
    "unknown account returns the same 401 message",
    noSuchUser.status === 401 &&
      noSuchUser.body?.error?.message === "Incorrect email or password",
    noSuchUser.body?.error,
  );

  const login = await call("POST", "/auth/login", {
    body: { email: userA.email, password: userA.password },
    mobile: true,
  });
  check("login returns 200 with a token", login.status === 200 && !!login.body?.accessToken);
  tokenA = login.body.accessToken;

  const meNoToken = await call("GET", "/auth/me");
  check("GET /auth/me without a token returns 401", meNoToken.status === 401);

  const meBadToken = await call("GET", "/auth/me", { token: "garbage.token.here" });
  check("GET /auth/me with a junk token returns 401", meBadToken.status === 401);

  const me = await call("GET", "/auth/me", { token: tokenA });
  check("GET /auth/me returns the right user", me.body?.user?.email === userA.email, me.body);

  const signupB = await call("POST", "/auth/signup", { body: userB, mobile: true });
  check("second user signs up", signupB.status === 201);
  const tokenB: string = signupB.body?.accessToken;

  /* ------------------------------------------------------------- tasks -- */
  section("Tasks");

  const noAuthTasks = await call("GET", "/tasks");
  check("GET /tasks without a token returns 401", noAuthTasks.status === 401);

  const createTask = await call("POST", "/tasks", {
    token: tokenA,
    body: {
      title: "Finish DayFlow",
      notes: "the whole thing",
      dueDate: today(),
      priority: "HIGH",
    },
  });
  check("create task returns 201", createTask.status === 201, createTask.body);
  const taskId: string = createTask.body?.task?.id;
  check(
    "due date round-trips as a plain YYYY-MM-DD",
    createTask.body?.task?.dueDate === today(),
    createTask.body?.task?.dueDate,
  );
  check("task defaults to incomplete", createTask.body?.task?.completed === false);

  await call("POST", "/tasks", {
    token: tokenA,
    body: { title: "Someday task", priority: "LOW" },
  });
  await call("POST", "/tasks", {
    token: tokenA,
    body: { title: "Upcoming task", dueDate: daysFromToday(3) },
  });

  const emptyTitle = await call("POST", "/tasks", {
    token: tokenA,
    body: { title: "   " },
  });
  check("blank title is rejected with 400", emptyTitle.status === 400);

  const badDate = await call("POST", "/tasks", {
    token: tokenA,
    body: { title: "Bad date", dueDate: "13-08-2026" },
  });
  check("non-ISO due date is rejected with 400", badDate.status === 400);

  const listA = await call("GET", "/tasks", { token: tokenA });
  check("task list returns all three", listA.body?.tasks?.length === 3, listA.body);
  check(
    "unscheduled tasks sort to the end",
    listA.body?.tasks?.[listA.body.tasks.length - 1]?.dueDate === null,
    listA.body?.tasks?.map((t: any) => t.dueDate),
  );

  const complete = await call("PATCH", `/tasks/${taskId}`, {
    token: tokenA,
    body: { completed: true },
  });
  check("completing a task sets completedAt", !!complete.body?.task?.completedAt);

  const uncomplete = await call("PATCH", `/tasks/${taskId}`, {
    token: tokenA,
    body: { completed: false },
  });
  check(
    "un-completing clears completedAt",
    uncomplete.body?.task?.completedAt === null,
    uncomplete.body?.task,
  );

  const clearDue = await call("PATCH", `/tasks/${taskId}`, {
    token: tokenA,
    body: { dueDate: null },
  });
  check("due date can be cleared to null", clearDue.body?.task?.dueDate === null);

  const partial = await call("PATCH", `/tasks/${taskId}`, {
    token: tokenA,
    body: { title: "Renamed" },
  });
  check(
    "a partial patch leaves untouched fields alone",
    partial.body?.task?.title === "Renamed" &&
      partial.body?.task?.priority === "HIGH",
    partial.body?.task,
  );

  /* ------------------------------------------------- tenant isolation -- */
  section("Tenant isolation (the important one)");

  const bList = await call("GET", "/tasks", { token: tokenB });
  check("user B sees none of user A's tasks", bList.body?.tasks?.length === 0, bList.body);

  const bRead = await call("PATCH", `/tasks/${taskId}`, {
    token: tokenB,
    body: { title: "hijacked" },
  });
  check("user B cannot patch user A's task (404)", bRead.status === 404, bRead.body);

  const bDelete = await call("DELETE", `/tasks/${taskId}`, { token: tokenB });
  check("user B cannot delete user A's task (404)", bDelete.status === 404);

  const stillThere = await call("GET", "/tasks", { token: tokenA });
  check(
    "user A's task survived B's attempts",
    stillThere.body?.tasks?.some((t: any) => t.id === taskId),
  );

  /* --------------------------------------------------------- timetable -- */
  section("Timetable");

  const createEvent = await call("POST", "/timetable", {
    token: tokenA,
    body: {
      title: "Data Structures lecture",
      date: today(),
      startMinute: 9 * 60,
      endMinute: 10 * 60 + 30,
      colorTag: "purple",
    },
  });
  check("create event returns 201", createEvent.status === 201, createEvent.body);
  const eventId: string = createEvent.body?.event?.id;

  const backwards = await call("POST", "/timetable", {
    token: tokenA,
    body: { title: "Backwards", date: today(), startMinute: 600, endMinute: 540 },
  });
  check("end before start is rejected with 400", backwards.status === 400);

  const outOfRange = await call("POST", "/timetable", {
    token: tokenA,
    body: { title: "Too late", date: today(), startMinute: 100, endMinute: 2000 },
  });
  check("a minute past 1439 is rejected with 400", outOfRange.status === 400);

  const patchEdge = await call("PATCH", `/timetable/${eventId}`, {
    token: tokenA,
    body: { startMinute: 12 * 60 },
  });
  check(
    "patching start past the stored end is rejected",
    patchEdge.status === 400,
    patchEdge.body,
  );

  const patchOk = await call("PATCH", `/timetable/${eventId}`, {
    token: tokenA,
    body: { startMinute: 8 * 60 },
  });
  check("a valid edge move succeeds", patchOk.body?.event?.startMinute === 480);

  const byDay = await call("GET", `/timetable?date=${today()}`, { token: tokenA });
  check("day query returns the event", byDay.body?.events?.length === 1, byDay.body);

  const otherDay = await call("GET", `/timetable?date=${daysFromToday(5)}`, {
    token: tokenA,
  });
  check("a different day returns nothing", otherDay.body?.events?.length === 0);

  const range = await call(
    "GET",
    `/timetable?from=${daysFromToday(-1)}&to=${daysFromToday(1)}`,
    { token: tokenA },
  );
  check("range query spans the event", range.body?.events?.length === 1);

  const bEvents = await call("GET", "/timetable", { token: tokenB });
  check("user B sees no events of A's", bEvents.body?.events?.length === 0);

  /* ------------------------------------------------------------ habits -- */
  section("Habits and streaks");

  const createHabit = await call("POST", "/habits", {
    token: tokenA,
    body: { name: "Read 20 pages", colorTag: "green" },
  });
  check("create habit returns 201", createHabit.status === 201, createHabit.body);
  const habitId: string = createHabit.body?.habit?.id;

  const fresh = await call("GET", `/habits/${habitId}/streak?today=${today()}`, {
    token: tokenA,
  });
  check("a new habit has a zero streak", fresh.body?.streak?.current === 0);
  check("the grid has 7 days", fresh.body?.grid?.length === 7, fresh.body?.grid);
  check(
    "the grid ends on today",
    fresh.body?.grid?.[6]?.date === today(),
    fresh.body?.grid?.[6],
  );

  const toggleOn = await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: today(), today: today() },
  });
  check("toggling today marks it complete", toggleOn.body?.log?.completed === true);
  check("streak becomes 1", toggleOn.body?.streak?.current === 1, toggleOn.body?.streak);

  const toggleOff = await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: today(), today: today() },
  });
  check("toggling again clears it", toggleOff.body?.log?.completed === false);
  check("streak returns to 0", toggleOff.body?.streak?.current === 0);

  const explicit = await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: today(), completed: true, today: today() },
  });
  check("an explicit completed:true sets it", explicit.body?.log?.completed === true);

  const repeat = await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: today(), completed: true, today: today() },
  });
  check(
    "repeating an explicit set is idempotent",
    repeat.body?.log?.completed === true && repeat.body?.streak?.current === 1,
    repeat.body?.streak,
  );

  // Build a 4-day run ending today.
  for (const offset of [-1, -2, -3]) {
    await call("POST", `/habits/${habitId}/log`, {
      token: tokenA,
      body: { date: daysFromToday(offset), completed: true, today: today() },
    });
  }
  const run = await call("GET", `/habits/${habitId}/streak?today=${today()}`, {
    token: tokenA,
  });
  check("four consecutive days give a streak of 4", run.body?.streak?.current === 4, run.body?.streak);
  check("longest streak is also 4", run.body?.streak?.longest === 4);

  // A gap at -5 with a completion at -6 must not extend the current streak.
  await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: daysFromToday(-6), completed: true, today: today() },
  });
  const gapped = await call("GET", `/habits/${habitId}/streak?today=${today()}`, {
    token: tokenA,
  });
  check(
    "a gap does not extend the current streak",
    gapped.body?.streak?.current === 4,
    gapped.body?.streak,
  );
  check("total completions counts every day", gapped.body?.streak?.totalCompletions === 5);

  // Un-tick today: the streak must survive, because today is not over yet.
  await call("POST", `/habits/${habitId}/log`, {
    token: tokenA,
    body: { date: today(), completed: false, today: today() },
  });
  const graced = await call("GET", `/habits/${habitId}/streak?today=${today()}`, {
    token: tokenA,
  });
  check(
    "an unticked today keeps yesterday's streak alive (3)",
    graced.body?.streak?.current === 3,
    graced.body?.streak,
  );
  check("completedToday is false", graced.body?.streak?.completedToday === false);

  // Viewed from tomorrow, that same history is a broken streak.
  const tomorrow = await call(
    "GET",
    `/habits/${habitId}/streak?today=${daysFromToday(1)}`,
    { token: tokenA },
  );
  check(
    "seen from tomorrow the streak is 0",
    tomorrow.body?.streak?.current === 0,
    tomorrow.body?.streak,
  );

  const habitList = await call("GET", `/habits?today=${today()}`, { token: tokenA });
  check("habit list includes streak and grid",
    habitList.body?.habits?.[0]?.streak !== undefined &&
    habitList.body?.habits?.[0]?.grid?.length === 7);

  const bHabitLog = await call("POST", `/habits/${habitId}/log`, {
    token: tokenB,
    body: { date: today() },
  });
  check("user B cannot log against A's habit (404)", bHabitLog.status === 404, bHabitLog.body);

  const bStreak = await call("GET", `/habits/${habitId}/streak`, { token: tokenB });
  check("user B cannot read A's streak (404)", bStreak.status === 404);

  /* ----------------------------------------------------- refresh/logout -- */
  section("Refresh and logout");

  const refreshed = await call("POST", "/auth/refresh", {
    body: { refreshToken: refreshA },
    mobile: true,
  });
  check("refresh returns a new access token", !!refreshed.body?.accessToken, refreshed.body);
  const rotatedRefresh: string = refreshed.body?.refreshToken;
  check("refresh rotates the refresh token", !!rotatedRefresh && rotatedRefresh !== refreshA);

  const reuseOld = await call("POST", "/auth/refresh", {
    body: { refreshToken: refreshA },
    mobile: true,
  });
  check("the old refresh token no longer works", reuseOld.status === 401, reuseOld.body);

  const newToken: string = refreshed.body.accessToken;
  const meAfter = await call("GET", "/auth/me", { token: newToken });
  check("the refreshed access token works", meAfter.status === 200);

  const logout = await call("POST", "/auth/logout", {
    body: { refreshToken: rotatedRefresh },
  });
  check("logout returns 204", logout.status === 204);

  const afterLogout = await call("POST", "/auth/refresh", {
    body: { refreshToken: rotatedRefresh },
    mobile: true,
  });
  check(
    "the refresh token is dead after logout",
    afterLogout.status === 401,
    afterLogout.body,
  );

  /* ----------------------------------------------------------- cleanup -- */
  section("Cleanup");
  // Deleting the habit must take its logs with it (onDelete: Cascade).
  const delHabit = await call("DELETE", `/habits/${habitId}`, { token: tokenA });
  check("habit deletes", delHabit.status === 204);
  const gone = await call("GET", `/habits/${habitId}/streak`, { token: tokenA });
  check("deleted habit is gone", gone.status === 404);

  const delEvent = await call("DELETE", `/timetable/${eventId}`, { token: tokenA });
  check("event deletes", delEvent.status === 204);

  const remaining = await call("GET", "/tasks", { token: tokenA });
  for (const t of remaining.body?.tasks ?? []) {
    await call("DELETE", `/tasks/${t.id}`, { token: tokenA });
  }
  const emptied = await call("GET", "/tasks", { token: tokenA });
  check("all tasks removed", emptied.body?.tasks?.length === 0);

  /* ------------------------------------------------------------ report -- */
  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    console.log(
      `\nNote: the two smoke users (${userA.email}, ${userB.email}) are left in the database.`,
    );
    process.exit(1);
  }
  console.log(
    `\nSmoke users left behind for inspection: ${userA.email}, ${userB.email}`,
  );
}

main().catch((err) => {
  console.error("\nSmoke run crashed:", err);
  process.exit(1);
});
