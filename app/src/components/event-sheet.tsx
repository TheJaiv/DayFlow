import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Segmented, Sheet, TextField } from "@/components/ui";
import type { TimetableEvent } from "@/lib/api";
import { longDate } from "@/lib/dates";
import { TAG_NAMES, makeStyles, useTheme, type TagName } from "@/theme";

export interface EventInput {
  title: string;
  date: string;
  startMinute: number;
  endMinute: number;
  colorTag: string;
  notes: string | null;
}

/** "09:30" -> 570. Returns null when it isn't a valid clock time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 570 -> "09:30". */
export function formatClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

const DURATIONS = [30, 45, 60, 90, 120];

export function EventSheet({
  visible,
  event,
  date,
  defaultStartMinute,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  /** null means "create new". */
  event: TimetableEvent | null;
  date: string;
  defaultStartMinute: number;
  onClose: () => void;
  onSave: (input: EventInput) => Promise<void>;
  onDelete?: (event: TimetableEvent) => Promise<void>;
}) {
  const s = useStyles();
  const { theme } = useTheme();

  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [colorTag, setColorTag] = useState<string>("blue");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(event?.title ?? "");
    setStart(formatClock(event?.startMinute ?? defaultStartMinute));
    setEnd(formatClock(event?.endMinute ?? Math.min(defaultStartMinute + 60, 1439)));
    setColorTag(event?.colorTag ?? "blue");
    setNotes(event?.notes ?? "");
    setError(null);
  }, [visible, event, defaultStartMinute]);

  function applyDuration(minutes: number) {
    const startMinute = parseClock(start);
    if (startMinute === null) {
      setError("Fix the start time first.");
      return;
    }
    setEnd(formatClock(Math.min(startMinute + minutes, 1439)));
  }

  async function handleSave() {
    const trimmed = title.trim();
    const startMinute = parseClock(start);
    const endMinute = parseClock(end);

    if (!trimmed) return setError("Give the event a title.");
    if (startMinute === null) return setError("Start time must look like 09:00.");
    if (endMinute === null) return setError("End time must look like 10:30.");
    // Mirrors the server rule so the user finds out before a round trip.
    if (endMinute <= startMinute) return setError("End time must be after the start time.");

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: trimmed,
        date,
        startMinute,
        endMinute,
        colorTag,
        notes: notes.trim() ? notes.trim() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(event);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet visible={visible} title={event ? "Edit event" : "New event"} onClose={onClose}>
      <Text style={s.dateLabel}>{longDate(date)}</Text>

      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Data Structures lecture"
        autoFocus={!event}
      />

      <View style={s.timeRow}>
        <View style={s.timeField}>
          <TextField
            label="Start"
            value={start}
            onChangeText={setStart}
            placeholder="09:00"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={s.timeField}>
          <TextField
            label="End"
            value={end}
            onChangeText={setEnd}
            placeholder="10:30"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      <Text style={s.label}>Quick duration</Text>
      <View style={s.group}>
        <View style={s.chipRow}>
          {DURATIONS.map((minutes) => (
            <Pressable
              key={minutes}
              onPress={() => applyDuration(minutes)}
              style={s.durationChip}
              accessibilityRole="button"
            >
              <Text style={s.durationText}>
                {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={s.label}>Colour</Text>
      <View style={s.group}>
        <View style={s.chipRow}>
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
      </View>

      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Room 204, bring the lab sheet"
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: "top" }}
      />

      {!!error && <Text style={s.error}>{error}</Text>}

      <Button label={event ? "Save changes" : "Add event"} onPress={handleSave} loading={saving} />

      {!!event && !!onDelete && (
        <Button
          label="Delete event"
          variant="danger"
          onPress={handleDelete}
          loading={deleting}
          style={{ marginTop: 12 }}
        />
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  dateLabel: {
    fontSize: t.fontSize.sm,
    color: t.colors.textMuted,
    marginBottom: t.spacing.lg,
  },
  timeRow: { flexDirection: "row", gap: t.spacing.md },
  timeField: { flex: 1 },
  label: {
    fontSize: t.fontSize.sm,
    fontWeight: "600",
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  group: { marginBottom: t.spacing.lg },
  chipRow: { flexDirection: "row", gap: t.spacing.sm, flexWrap: "wrap" },
  durationChip: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  durationText: { fontSize: t.fontSize.sm, fontWeight: "600", color: t.colors.textMuted },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 0 },
  error: { fontSize: t.fontSize.sm, color: t.colors.danger, marginBottom: t.spacing.md },
}));
