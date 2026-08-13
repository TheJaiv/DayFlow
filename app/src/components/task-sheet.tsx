import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Segmented, Sheet, TextField } from "@/components/ui";
import type { Priority, Task } from "@/lib/api";
import { addDays, friendlyDate, todayKey } from "@/lib/dates";
import { makeStyles, useTheme } from "@/theme";

export interface TaskInput {
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: Priority;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function TaskSheet({
  visible,
  task,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  /** null means "create new". */
  task: Task | null;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  onDelete?: (task: Task) => Promise<void>;
}) {
  const s = useStyles();
  const { theme } = useTheme();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset whenever the sheet opens, so editing task B never shows task A's
  // half-typed state.
  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDueDate(task?.dueDate ?? null);
    setPriority(task?.priority ?? "MEDIUM");
    setError(null);
  }, [visible, task]);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the task a title.");
      return;
    }
    if (dueDate !== null && !DATE_RE.test(dueDate)) {
      setError("Due date must look like 2026-08-13.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: trimmed,
        notes: notes.trim() ? notes.trim() : null,
        dueDate,
        priority,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  const today = todayKey();
  const quickDates: { label: string; value: string | null }[] = [
    { label: "None", value: null },
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "In a week", value: addDays(today, 7) },
  ];

  return (
    <Sheet visible={visible} title={task ? "Edit task" : "New task"} onClose={onClose}>
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="What needs doing?"
        autoFocus={!task}
      />

      <TextField
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional detail"
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: "top" }}
      />

      <Text style={s.label}>Priority</Text>
      <View style={s.group}>
        <Segmented
          options={PRIORITIES}
          value={priority}
          onChange={setPriority}
          tint={(value) => theme.colors.priority[value]}
        />
      </View>

      <Text style={s.label}>Due</Text>
      <View style={s.group}>
        <Segmented
          options={quickDates.map((d) => ({
            value: d.value ?? "__none__",
            label: d.label,
          }))}
          value={dueDate ?? "__none__"}
          onChange={(value) => setDueDate(value === "__none__" ? null : value)}
        />
      </View>

      <TextField
        label="Or an exact date (YYYY-MM-DD)"
        value={dueDate ?? ""}
        onChangeText={(text) => setDueDate(text.trim() ? text.trim() : null)}
        placeholder="2026-08-13"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {!!dueDate && DATE_RE.test(dueDate) && (
        <Text style={s.hint}>Due {friendlyDate(dueDate)}</Text>
      )}

      {!!error && <Text style={s.error}>{error}</Text>}

      <Button label={task ? "Save changes" : "Add task"} onPress={handleSave} loading={saving} />

      {!!task && !!onDelete && (
        <Button
          label="Delete task"
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
  label: {
    fontSize: t.fontSize.sm,
    fontWeight: "600",
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  group: { marginBottom: t.spacing.lg },
  hint: {
    fontSize: t.fontSize.sm,
    color: t.colors.textMuted,
    marginBottom: t.spacing.md,
  },
  error: {
    fontSize: t.fontSize.sm,
    color: t.colors.danger,
    marginBottom: t.spacing.md,
  },
}));
