import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
  Screen,
} from "@/components/ui";
import { TaskSheet, type TaskInput } from "@/components/task-sheet";
import { ApiError, tasksApi, type Task } from "@/lib/api";
import { friendlyDate, todayKey } from "@/lib/dates";
import { useResource } from "@/lib/use-resource";
import { makeStyles, useTheme } from "@/theme";

type SectionKey = "Overdue" | "Today" | "Upcoming" | "Someday" | "Done";

export default function TodoScreen() {
  const s = useStyles();
  const { theme } = useTheme();

  const loader = useCallback(() => tasksApi.list(), []);
  const { data, loading, refreshing, error, setData, setError, refresh, reload } =
    useResource<Task[]>(loader);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const tasks = data ?? [];

  // Grouping happens here rather than on the server because only the device
  // knows the user's local date -- the same task is "Today" in Kolkata and
  // "Tomorrow" in UTC at the wrong hour.
  const sections = useMemo(() => {
    const today = todayKey();
    const buckets: Record<SectionKey, Task[]> = {
      Overdue: [],
      Today: [],
      Upcoming: [],
      Someday: [],
      Done: [],
    };

    for (const task of tasks) {
      if (task.completed) {
        buckets.Done.push(task);
      } else if (task.dueDate === null) {
        buckets.Someday.push(task);
      } else if (task.dueDate < today) {
        buckets.Overdue.push(task);
      } else if (task.dueDate === today) {
        buckets.Today.push(task);
      } else {
        buckets.Upcoming.push(task);
      }
    }

    const order: SectionKey[] = ["Overdue", "Today", "Upcoming", "Someday"];
    const result = order
      .filter((key) => buckets[key].length > 0)
      .map((key) => ({ title: key, data: buckets[key] }));

    if (showDone && buckets.Done.length) {
      result.push({ title: "Done" as SectionKey, data: buckets.Done });
    }
    return result;
  }, [tasks, showDone]);

  const doneCount = tasks.filter((t) => t.completed).length;
  const openCount = tasks.length - doneCount;

  /** Flips the checkbox immediately and rolls back if the server disagrees. */
  const toggleComplete = useCallback(
    async (task: Task) => {
      const next = !task.completed;
      setMutationError(null);
      setData((current) =>
        current.map((t) => (t.id === task.id ? { ...t, completed: next } : t)),
      );

      try {
        const updated = await tasksApi.update(task.id, { completed: next });
        setData((current) => current.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        setData((current) =>
          current.map((t) => (t.id === task.id ? { ...t, completed: !next } : t)),
        );
        setMutationError(
          err instanceof ApiError ? err.message : "Could not update that task.",
        );
      }
    },
    [setData],
  );

  const saveTask = useCallback(
    async (input: TaskInput) => {
      if (editing) {
        const updated = await tasksApi.update(editing.id, input);
        setData((current) => current.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await tasksApi.create(input);
        setData((current) => [created, ...current]);
      }
    },
    [editing, setData],
  );

  const deleteTask = useCallback(
    async (task: Task) => {
      await tasksApi.remove(task.id);
      setData((current) => current.filter((t) => t.id !== task.id));
    },
    [setData],
  );

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setSheetOpen(true);
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading your tasks" />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.heading}>To-Do</Text>
          <Text style={s.sub}>
            {openCount === 0
              ? "Nothing open. Nice."
              : `${openCount} open${doneCount ? ` · ${doneCount} done` : ""}`}
          </Text>
        </View>
        <Pressable
          onPress={openNew}
          style={s.addButton}
          accessibilityRole="button"
          accessibilityLabel="New task"
        >
          <Ionicons name="add" size={24} color={theme.colors.onAccent} />
        </Pressable>
      </View>

      {!!mutationError && (
        <ErrorBanner message={mutationError} onDismiss={() => setMutationError(null)} />
      )}
      {!!error && !!data && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              s.sectionHeader,
              section.title === "Overdue" && { color: theme.colors.danger },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <TaskRow task={item} onToggle={toggleComplete} onPress={openEdit} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No tasks yet"
            hint="Tap + to add the first one. Tasks without a due date land in Someday."
          />
        }
        ListFooterComponent={
          doneCount > 0 ? (
            <Button
              label={showDone ? `Hide ${doneCount} done` : `Show ${doneCount} done`}
              variant="ghost"
              onPress={() => setShowDone((v) => !v)}
              style={{ marginTop: 8 }}
            />
          ) : null
        }
      />

      <TaskSheet
        visible={sheetOpen}
        task={editing}
        onClose={() => setSheetOpen(false)}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </Screen>
  );
}

function TaskRow({
  task,
  onToggle,
  onPress,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onPress: (task: Task) => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const today = todayKey();
  const overdue = !task.completed && task.dueDate !== null && task.dueDate < today;

  return (
    <Pressable
      onPress={() => onPress(task)}
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${task.title}`}
    >
      <Pressable
        onPress={() => onToggle(task)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed }}
        accessibilityLabel={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
      >
        <Ionicons
          name={task.completed ? "checkmark-circle" : "ellipse-outline"}
          size={26}
          color={task.completed ? theme.colors.success : theme.colors.priority[task.priority]}
        />
      </Pressable>

      <View style={s.rowBody}>
        <Text style={[s.rowTitle, task.completed && s.rowTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.notes && (
          <Text style={s.rowNotes} numberOfLines={1}>
            {task.notes}
          </Text>
        )}
        <View style={s.metaRow}>
          <View style={[s.priorityDot, { backgroundColor: theme.colors.priority[task.priority] }]} />
          <Text style={s.metaText}>{task.priority.toLowerCase()}</Text>
          {!!task.dueDate && (
            <Text style={[s.metaText, overdue && { color: theme.colors.danger }]}>
              · {friendlyDate(task.dueDate, today)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.lg,
    gap: t.spacing.md,
  },
  headerText: { flex: 1 },
  heading: {
    fontSize: t.fontSize.xxl,
    fontWeight: "700",
    color: t.colors.text,
    letterSpacing: -0.5,
  },
  sub: { fontSize: t.fontSize.sm, color: t.colors.textMuted, marginTop: 2 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.xxl,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: t.fontSize.xs,
    fontWeight: "700",
    color: t.colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: t.spacing.lg,
    marginBottom: t.spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: t.spacing.md,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.md,
    marginBottom: t.spacing.sm,
    alignItems: "flex-start",
  },
  rowPressed: { opacity: 0.7 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: t.fontSize.md, color: t.colors.text, fontWeight: "500" },
  rowTitleDone: {
    textDecorationLine: "line-through",
    color: t.colors.textFaint,
  },
  rowNotes: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
  metaRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.xs, marginTop: 4 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { fontSize: t.fontSize.xs, color: t.colors.textFaint },
}));
