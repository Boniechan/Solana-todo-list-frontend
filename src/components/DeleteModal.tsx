import type { TodoTask } from "../lib/todo";

type DeleteModalProps = {
  task: TodoTask;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteModal({ task, busy, onCancel, onConfirm }: DeleteModalProps) {
  return <div className="modal-backdrop" role="presentation"><div className="modal modal--confirm" role="dialog" aria-modal="true" aria-labelledby="delete-heading"><div className="confirm-icon">!</div><h2 id="delete-heading">Delete this task?</h2><p className="modal-copy">This action will permanently remove the task from the blockchain.</p><div className="form-actions"><button className="ghost-button" onClick={onCancel} type="button">Cancel</button><button className="danger-button" disabled={busy} onClick={onConfirm} type="button">{busy ? "Deleting..." : "Delete Task"}</button></div></div></div>;
}
