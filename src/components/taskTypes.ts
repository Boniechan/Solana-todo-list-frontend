export type TaskMeta = {
  completed: boolean;
  dueDate: string;
};

export type TaskMetaMap = Record<string, TaskMeta>;

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatShortDate(value: string): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`)
  );
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getWeekDays(): Date[] {
  const firstDay = new Date();
  const day = firstDay.getDay();
  firstDay.setDate(firstDay.getDate() - (day === 0 ? 6 : day - 1));
  firstDay.setHours(12, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const weekDay = new Date(firstDay);
    weekDay.setDate(firstDay.getDate() + index);
    return weekDay;
  });
}
