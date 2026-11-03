import type { TodoTask } from "../lib/todo";
import { formatShortDate, type TaskMetaMap } from "./taskTypes";

type TaskListProps = {
  tasks: TodoTask[];
  taskMeta: TaskMetaMap;
  connected: boolean;
  busyAction: string | null;
  onEdit: (task: TodoTask) => void;
  onDelete: (task: TodoTask) => void;
  onToggleComplete: (task: TodoTask) => void;
  onCreate: () => void;
  accountLink: (address: TodoTask["publicKey"]) => string;
};

export function TaskList({ tasks, taskMeta, connected, busyAction, onEdit, onDelete, onToggleComplete, onCreate, accountLink }: TaskListProps) {
  return <div className="task-list">
    {tasks.length === 0 ? <div className="empty-state empty-state--large"><div className="empty-icon">✓</div><p>No tasks yet.</p><span>Start organizing your productivity by creating your first task.</span><button className="ghost-button" disabled={!connected} onClick={onCreate} type="button">Create your first task</button></div> : tasks.map((task) => {
      const taskKey = task.publicKey.toBase58();
      const isComplete = taskMeta[taskKey]?.completed ?? false;
      return <article className={`task-card${isComplete ? " task-card--complete" : ""}`} key={taskKey}><span className="task-indicator" /><div className="task-card__body"><div className="task-card__header"><div className="task-title-row"><button className={`task-check${isComplete ? " task-check--done" : ""}`} aria-label={isComplete ? "Mark task as active" : "Mark task as done"} onClick={() => onToggleComplete(task)} type="button">{isComplete ? "✓" : ""}</button><div><h3>{task.title || "Untitled task"}</h3><p className="task-card__description">{task.description || "No description saved."}</p></div></div><div className="task-card__actions"><button className="text-button" disabled={!connected || busyAction !== null} onClick={() => onEdit(task)} type="button">Edit</button><button className="text-button text-button--danger" disabled={!connected || busyAction !== null} onClick={() => onDelete(task)} type="button">{busyAction === `delete-${task.id.toString()}` ? "Deleting..." : "Delete"}</button></div></div><div className="task-card__meta"><span>Task ID: #{task.id.toString()}</span><span className="due-date">{taskMeta[taskKey]?.dueDate ? `Due ${formatShortDate(taskMeta[taskKey].dueDate)}` : "No due date"}</span><span>{task.authority.toBase58().slice(0, 4)}...{task.authority.toBase58().slice(-4)}</span><a href={accountLink(task.publicKey)} rel="noreferrer" target="_blank">View on Explorer ↗</a></div></div></article>;
    })}
  </div>;
}
