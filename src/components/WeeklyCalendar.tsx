import type { TodoTask } from "../lib/todo";
import { dateKey, formatShortDate, getWeekDays, todayKey, type TaskMetaMap } from "./taskTypes";

type WeeklyCalendarProps = {
  tasks: TodoTask[];
  taskMeta: TaskMetaMap;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onToggleComplete: (task: TodoTask) => void;
};

export function WeeklyCalendar({ tasks, taskMeta, selectedDate, onSelectDate, onToggleComplete }: WeeklyCalendarProps) {
  const weekDays = getWeekDays();
  const scheduledTasks = tasks.filter((task) => taskMeta[task.publicKey.toBase58()]?.dueDate);
  const selectedTasks = scheduledTasks.filter(
    (task) => taskMeta[task.publicKey.toBase58()]?.dueDate === selectedDate
  );

  return (
    <section className="planning-grid" aria-label="Weekly planning">
      <article className="planning-panel weekly-panel">
        <div className="planning-heading"><div><p className="eyebrow">Weekly focus</p><h2>Weekly Tasks</h2></div><span className="planning-count">{scheduledTasks.length} scheduled</span></div>
        <div className="weekly-list">
          {selectedTasks.length === 0 ? <p className="planning-empty">No tasks scheduled for {formatShortDate(selectedDate)}.</p> : selectedTasks.map((task) => {
            const key = task.publicKey.toBase58();
            const isComplete = taskMeta[key]?.completed ?? false;
            return <div className={`weekly-task${isComplete ? " weekly-task--done" : ""}`} key={key}><button className={`task-check${isComplete ? " task-check--done" : ""}`} aria-label={isComplete ? "Mark task as active" : "Mark task as done"} onClick={() => onToggleComplete(task)} type="button">{isComplete ? "✓" : ""}</button><span>{task.title}</span><small>{formatShortDate(taskMeta[key]?.dueDate ?? "")}</small></div>;
          })}
        </div>
      </article>
      <article className="planning-panel calendar-panel">
        <div className="planning-heading"><div><p className="eyebrow">Your schedule</p><h2>Calendar</h2></div><span className="calendar-month">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date())}</span></div>
        <div className="calendar-week">{weekDays.map((day) => {
          const key = dateKey(day);
          const count = scheduledTasks.filter((task) => taskMeta[task.publicKey.toBase58()]?.dueDate === key).length;
          return <button className={`calendar-day${key === todayKey() ? " calendar-day--today" : ""}${key === selectedDate ? " calendar-day--selected" : ""}`} key={key} onClick={() => onSelectDate(key)} type="button"><span>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong><i>{count || ""}</i></button>;
        })}</div>
      </article>
    </section>
  );
}
