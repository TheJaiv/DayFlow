import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  EmptyState,
  ErrorBanner,
  ErrorState,
  LoadingState,
  Screen,
  Sheet,
  TextField,
} from "@/components/ui";
import { ApiError, habitsApi, type GridDay, type Habit } from "@/lib/api";
import { todayKey, weekdayShort } from "@/lib/dates";
import { useResource } from "@/lib/use-resource";
import { TAG_NAMES, makeStyles, useTheme, type TagName } from "@/theme";

export default function HabitsScreen() {
  const s = useStyles();
  const { theme } = useTheme();

  const today = useMemo(() => todayKey(), []);
  const loader = useCallback(() => habitsApi.list(today), [today]);
  const { data, loading, refreshing, error, setData, setError, refresh, reload } =
    useResource<Habit[]>(loader);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [colorTag, setColorTag] = useState<string>("green");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const habits = data ?? [];

  /**
   * Optimistically flips the box, then reconciles with the server's answer --
   * the response carries the recomputed streak and grid, which is cheaper and
   * more reliable than trying to recompute the streak on the client.
   */
  const toggleDay = useCallback(
    async (habit: Habit, day: GridDay) => {
      setMutationError(null);
      setBusyIds((current) => new Set(current).add(habit.id));

      const optimistic = habit.grid.map((d) =>
        d.date === day.date ? { ...d, completed: !d.completed } : d,
      );
      setData((current) =>
        current.map((h) => (h.id === habit.id ? { ...h, grid: optimistic } : h)),
      );

      try {
        const result = await habitsApi.toggle(habit.id, day.date, today);
        setData((current) =>
          current.map((h) =>
            h.id === habit.id ? { ...h, grid: result.grid, streak: result.streak } : h,
          ),
        );
      } catch (err) {
        // Put the original grid back rather than guessing.
        setData((current) =>
          current.map((h) => (h.id === habit.id ? { ...h, grid: habit.grid } : h)),
        );
        setMutationError(
          err instanceof ApiError ? err.message : "Could not update that habit.",
        );
      } finally {
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(habit.id);
          return next;
        });
      }
    },
    [setData, today],
  );

  async function createHabit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Give the habit a name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await habitsApi.create({ name: trimmed, colorTag });
      setData((current) => [...current, created]);
      setName("");
      setColorTag("green");
      setSheetOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create that habit.");
    } finally {
      setSaving(false);
    }
  }

  const removeHabit = useCallback(
    async (habit: Habit) => {
      const snapshot = data ?? [];
      setData((current) => current.filter((h) => h.id !== habit.id));
      try {
        await habitsApi.remove(habit.id);
      } catch (err) {
        setData(snapshot);
        setMutationError(
          err instanceof ApiError ? err.message : "Could not delete that habit.",
        );
      }
    },
    [data, setData],
  );

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading your habits" />
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

  const doneToday = habits.filter((h) => h.streak.completedToday).length;

  return (
    <Screen>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.heading}>Habits</Text>
          <Text style={s.sub}>
            {habits.length === 0
              ? "Build the first one"
              : `${doneToday} of ${habits.length} done today`}
          </Text>
        </View>
        <Pressable
          onPress={() => setSheetOpen(true)}
          style={s.addButton}
          accessibilityRole="button"
          accessibilityLabel="New habit"
        >
          <Ionicons name="add" size={24} color={theme.colors.onAccent} />
        </Pressable>
      </View>

      {!!mutationError && (
        <ErrorBanner message={mutationError} onDismiss={() => setMutationError(null)} />
      )}
      {!!error && !!data && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {habits.length === 0 ? (
          <EmptyState
            title="No habits yet"
            hint="Add one and tick it off each day. The streak counts consecutive days."
          />
        ) : (
          habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              today={today}
              busy={busyIds.has(habit.id)}
              onToggle={toggleDay}
              onDelete={removeHabit}
            />
          ))
        )}
      </ScrollView>

      <Sheet visible={sheetOpen} title="New habit" onClose={() => setSheetOpen(false)}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Read 20 pages"
          autoFocus
        />

        <Text style={s.label}>Colour</Text>
        <View style={s.swatchRow}>
          {TAG_NAMES.map((tag: TagName) => (
            <Pressable
              key={tag}
              onPress={() => setColorTag(tag)}
              accessibilityRole="radio"
              accessibilityState={{ selected: colorTag === tag }}
              accessibilityLabel={tag}
              style={[
                s.swatch,
                { backgroundColor: theme.colors.tags[tag] },
                colorTag === tag && { borderColor: theme.colors.text, borderWidth: 3 },
              ]}
            />
          ))}
        </View>

        {!!formError && <Text style={s.error}>{formError}</Text>}

        <Button label="Add habit" onPress={createHabit} loading={saving} />
      </Sheet>
    </Screen>
  );
}

function HabitCard({
  habit,
  today,
  busy,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  today: string;
  busy: boolean;
  onToggle: (habit: Habit, day: GridDay) => void;
  onDelete: (habit: Habit) => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const colour = theme.colors.tags[habit.colorTag as TagName] ?? theme.colors.tags.green;

  return (
    <View style={[s.card, busy && { opacity: 0.6 }]}>
      <View style={s.cardHeader}>
        <View style={[s.colourBar, { backgroundColor: colour }]} />
        <View style={s.cardTitleBlock}>
          <Text style={s.habitName} numberOfLines={1}>
            {habit.name}
          </Text>
          <View style={s.streakRow}>
            <Ionicons
              name="flame"
              size={14}
              color={habit.streak.current > 0 ? colour : theme.colors.textFaint}
            />
            <Text style={s.streakText}>
              {habit.streak.current === 0
                ? "No streak yet"
                : `${habit.streak.current} day${habit.streak.current === 1 ? "" : "s"}`}
            </Text>
            {habit.streak.longest > habit.streak.current && (
              <Text style={s.bestText}>best {habit.streak.longest}</Text>
            )}
          </View>
        </View>

        <Pressable
          onPress={() => (confirming ? onDelete(habit) : setConfirming(true))}
          onBlur={() => setConfirming(false)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={confirming ? `Confirm delete ${habit.name}` : `Delete ${habit.name}`}
        >
          <Text style={[s.deleteText, confirming && { color: theme.colors.danger }]}>
            {confirming ? "Sure?" : "Delete"}
          </Text>
        </Pressable>
      </View>

      <View style={s.gridRow}>
        {habit.grid.map((day) => {
          const isToday = day.date === today;
          return (
            <Pressable
              key={day.date}
              onPress={() => onToggle(habit, day)}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: day.completed }}
              accessibilityLabel={`${habit.name} on ${day.date}`}
              style={s.dayCell}
            >
              <Text style={[s.dayLabel, isToday && { color: theme.colors.text, fontWeight: "700" }]}>
                {weekdayShort(day.date).charAt(0)}
              </Text>
              <View
                style={[
                  s.dayBox,
                  day.completed && { backgroundColor: colour, borderColor: colour },
                  isToday && !day.completed && { borderColor: colour, borderWidth: 2 },
                ]}
              >
                {day.completed && (
                  <Ionicons name="checkmark" size={16} color={theme.colors.onAccent} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  list: { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxl, flexGrow: 1 },
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: t.spacing.lg,
    marginBottom: t.spacing.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: t.spacing.md },
  colourBar: { width: 4, height: 34, borderRadius: 2 },
  cardTitleBlock: { flex: 1 },
  habitName: { fontSize: t.fontSize.md, fontWeight: "600", color: t.colors.text },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  streakText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
  bestText: { fontSize: t.fontSize.xs, color: t.colors.textFaint, marginLeft: 4 },
  deleteText: { fontSize: t.fontSize.sm, color: t.colors.textFaint, fontWeight: "600" },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: t.spacing.lg,
  },
  dayCell: { alignItems: "center", gap: 6, flex: 1 },
  dayLabel: { fontSize: t.fontSize.xs, color: t.colors.textFaint },
  dayBox: {
    width: 32,
    height: 32,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: t.fontSize.sm,
    fontWeight: "600",
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  swatchRow: {
    flexDirection: "row",
    gap: t.spacing.sm,
    flexWrap: "wrap",
    marginBottom: t.spacing.lg,
  },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  error: { fontSize: t.fontSize.sm, color: t.colors.danger, marginBottom: t.spacing.md },
}));
