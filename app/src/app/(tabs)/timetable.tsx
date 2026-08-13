import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ErrorBanner, ErrorState, LoadingState, Screen } from "@/components/ui";
import { EventSheet, formatClock, type EventInput } from "@/components/event-sheet";
import { ApiError, timetableApi, type TimetableEvent } from "@/lib/api";
import { addDays, longDate, todayKey, weekdayShort } from "@/lib/dates";
import { useResource } from "@/lib/use-resource";
import { makeStyles, useTheme, type TagName } from "@/theme";

// The visible grid runs 6am to 11pm, as specified. Anything outside is clamped
// into view rather than hidden, so a 2am study session is still reachable.
const DAY_START = 6 * 60;
const DAY_END = 23 * 60;
const HOUR_HEIGHT = 64;
const GRID_HEIGHT = ((DAY_END - DAY_START) / 60) * HOUR_HEIGHT;

// Horizontal travel before a drag counts as "change day", and how much more
// horizontal than vertical it must be to not steal the grid's own scrolling.
const SWIPE_THRESHOLD = 60;
const SWIPE_DOMINANCE = 1.5;

/**
 * One day is rendered at a time, driven purely by `selected`.
 *
 * This used to be a horizontally paged FlatList over a 121-day window, which
 * was a mistake: `initialScrollIndex` is not honoured reliably by
 * react-native-web, so the pager sat on the first page (60 days in the past)
 * while the header displayed today. The header and the grid disagreed, and
 * events saved against "today" appeared on a page the user could not see.
 * Rendering exactly the day in state cannot drift like that.
 */
export default function TimetableScreen() {
  const s = useStyles();
  const { theme } = useTheme();

  const today = useMemo(() => todayKey(), []);
  const [selected, setSelected] = useState(today);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TimetableEvent | null>(null);
  const [defaultStart, setDefaultStart] = useState(9 * 60);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Held in a ref as well so the PanResponder, created once, always reads the
  // current day rather than the one captured when it was built.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const shiftDay = useCallback((delta: number) => {
    setSelected(addDays(selectedRef.current, delta));
  }, []);

  // Swipe left for the next day, right for the previous one. The dominance
  // check lets a mostly-vertical drag fall through to the hour grid's scroll.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * SWIPE_DOMINANCE,
      onPanResponderRelease: (_evt, g) => {
        if (g.dx <= -SWIPE_THRESHOLD) shiftDay(1);
        else if (g.dx >= SWIPE_THRESHOLD) shiftDay(-1);
      },
    }),
  ).current;

  // Fetching a small window rather than the single day keeps neighbouring days
  // warm in the cache, so stepping back and forth does not flash empty.
  const loader = useCallback(
    () => timetableApi.listRange(addDays(selected, -3), addDays(selected, 3)),
    [selected],
  );
  const { data, loading, refreshing, error, setData, setError, refresh, reload } =
    useResource<TimetableEvent[]>(loader);

  // Only ever show events whose date matches the selected day. Belt and braces
  // against the range fetch above leaking a neighbour onto the grid.
  const events = useMemo(
    () =>
      (data ?? [])
        .filter((event) => event.date === selected)
        .sort((a, b) => a.startMinute - b.startMinute),
    [data, selected],
  );

  function openNew(startMinute: number) {
    setEditing(null);
    setDefaultStart(startMinute);
    setSheetOpen(true);
  }

  function openEdit(event: TimetableEvent) {
    setEditing(event);
    setSheetOpen(true);
  }

  const saveEvent = useCallback(
    async (input: EventInput) => {
      if (editing) {
        const updated = await timetableApi.update(editing.id, input);
        setData((current) => current.map((e) => (e.id === updated.id ? updated : e)));
      } else {
        const created = await timetableApi.create(input);
        setData((current) => [...current, created]);
      }
    },
    [editing, setData],
  );

  const deleteEvent = useCallback(
    async (event: TimetableEvent) => {
      try {
        await timetableApi.remove(event.id);
        setData((current) => current.filter((e) => e.id !== event.id));
      } catch (err) {
        setMutationError(
          err instanceof ApiError ? err.message : "Could not delete that event.",
        );
        throw err;
      }
    },
    [setData],
  );

  if (loading && !data) {
    return (
      <Screen>
        <LoadingState label="Loading your timetable" />
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

  const hours = Array.from(
    { length: (DAY_END - DAY_START) / 60 },
    (_, i) => DAY_START + i * 60,
  );

  return (
    <Screen>
      <View style={s.header}>
        <Pressable
          onPress={() => shiftDay(-1)}
          hitSlop={10}
          style={s.navButton}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>

        <Pressable
          onPress={() => setSelected(today)}
          style={s.headerCentre}
          accessibilityRole="button"
          accessibilityLabel="Jump to today"
        >
          <Text style={s.heading}>{longDate(selected)}</Text>
          <Text style={s.sub}>
            {selected === today ? "Today" : "Tap to jump back to today"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => shiftDay(1)}
          hitSlop={10}
          style={s.navButton}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {!!mutationError && (
        <ErrorBanner message={mutationError} onDismiss={() => setMutationError(null)} />
      )}
      {!!error && !!data && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <View style={s.flex} {...panResponder.panHandlers}>
        <ScrollView
          contentContainerStyle={s.gridScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.colors.accent}
            />
          }
        >
          <Text style={s.dayLabel}>
            {weekdayShort(selected)} · {events.length}{" "}
            {events.length === 1 ? "event" : "events"}
          </Text>

          <View style={s.grid}>
            {/* Hour rows double as tap targets: tapping one opens the sheet
                pre-filled with that hour. */}
            {hours.map((minute) => (
              <Pressable
                key={minute}
                onPress={() => openNew(minute)}
                style={s.hourRow}
                accessibilityRole="button"
                accessibilityLabel={`Add event at ${formatClock(minute)}`}
              >
                <Text style={s.hourLabel}>{formatClock(minute)}</Text>
                <View style={s.hourLine} />
              </Pressable>
            ))}

            {/* Events float above the grid, positioned by minute offset. */}
            <View style={s.eventLayer} pointerEvents="box-none">
              {events.map((event) => {
                const start = Math.max(event.startMinute, DAY_START);
                const end = Math.min(Math.max(event.endMinute, start + 15), DAY_END);
                const top = ((start - DAY_START) / 60) * HOUR_HEIGHT;
                const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 26);
                const colour =
                  theme.colors.tags[event.colorTag as TagName] ?? theme.colors.tags.blue;

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => openEdit(event)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${event.title}`}
                    style={({ pressed }) => [
                      s.event,
                      {
                        top,
                        height,
                        backgroundColor: theme.dark ? `${colour}33` : `${colour}22`,
                        borderLeftColor: colour,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[s.eventTitle, { color: colour }]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={s.eventTime} numberOfLines={1}>
                      {formatClock(event.startMinute)} – {formatClock(event.endMinute)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {events.length === 0 && (
            <Text style={s.emptyHint}>
              Nothing scheduled. Tap any hour to add something, or swipe to change day.
            </Text>
          )}
        </ScrollView>
      </View>

      <EventSheet
        visible={sheetOpen}
        event={editing}
        date={selected}
        defaultStartMinute={defaultStart}
        onClose={() => setSheetOpen(false)}
        onSave={saveEvent}
        onDelete={deleteEvent}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.lg,
    gap: t.spacing.sm,
  },
  headerCentre: { flex: 1, alignItems: "center" },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: t.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  heading: {
    fontSize: t.fontSize.lg,
    fontWeight: "700",
    color: t.colors.text,
    textAlign: "center",
  },
  sub: { fontSize: t.fontSize.xs, color: t.colors.textMuted, marginTop: 2 },
  gridScroll: { paddingBottom: t.spacing.xxl },
  dayLabel: {
    fontSize: t.fontSize.xs,
    color: t.colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    paddingHorizontal: t.spacing.lg,
    marginBottom: t.spacing.sm,
  },
  grid: { height: GRID_HEIGHT, position: "relative" },
  hourRow: { height: HOUR_HEIGHT, flexDirection: "row", alignItems: "flex-start" },
  hourLabel: {
    width: 56,
    fontSize: t.fontSize.xs,
    color: t.colors.textFaint,
    textAlign: "right",
    paddingRight: t.spacing.sm,
    marginTop: -6,
  },
  hourLine: { flex: 1, height: 1, backgroundColor: t.colors.border },
  eventLayer: {
    position: "absolute",
    left: 60,
    right: t.spacing.lg,
    top: 0,
    bottom: 0,
  },
  event: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: t.radius.sm,
    borderLeftWidth: 3,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: 4,
    overflow: "hidden",
  },
  eventTitle: { fontSize: t.fontSize.sm, fontWeight: "700" },
  eventTime: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
  emptyHint: {
    textAlign: "center",
    color: t.colors.textFaint,
    fontSize: t.fontSize.sm,
    paddingHorizontal: t.spacing.xl,
    marginTop: t.spacing.lg,
  },
}));
