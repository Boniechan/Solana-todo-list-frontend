import type { FormEvent } from "react";
import type { TodoTask } from "../lib/todo";
import { todayKey } from "./taskTypes";

type TaskModalProps = {
  mode: "create" | "edit";
  editingTask: TodoTask | null;
  title: string;
  description: string;
  dueDate: string;
  connected: boolean;
  busyAction: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function TaskModal({ mode, editingTask, title, description, dueDate, connected, busyAction, onTitleChange, onDescriptionChange, onDueDateChange, onSubmit, onClose }: TaskModalProps) {
  const isEdit = mode === "edit";
  return <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${mode}-heading`}><button className="modal-close" aria-label="Close" onClick={onClose} type="button">×</button><p className="eyebrow">{isEdit ? `Task #${editingTask?.id.toString()}` : "New task"}</p><h2 id={`${mode}-heading`}>{isEdit ? "Edit task" : "Create a new task"}</h2><p className="modal-copy">{isEdit ? "Update your task and schedule." : "Add a task to your wallet-owned workspace on Devnet."}</p><form className="task-form" onSubmit={onSubmit}><label>Title<input autoFocus maxLength={64} onChange={(event) => onTitleChange(event.target.value)} placeholder="What needs to be done?" value={title} /></label><label>Description<textarea maxLength={64} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Add a little context" rows={4} value={description} /></label><label>Due date<input min={todayKey()} onChange={(event) => onDueDateChange(event.target.value)} type="date" value={dueDate} /></label><div className="form-actions"><button className="ghost-button" onClick={onClose} type="button">Cancel</button><button className="primary-button" disabled={!connected || busyAction !== null} type="submit">{busyAction ? "Saving..." : isEdit ? "Save changes" : "Save Task"}</button></div></form></div></div>;
}
