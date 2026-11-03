import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  WalletMultiButton
} from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildCreateTaskTransaction,
  buildDeleteTaskTransaction,
  buildUpdateTaskTransaction,
  deriveTaskPda,
  fetchTasksForAuthority,
  getProgramId,
  sendAndConfirmWalletTransaction,
  type TodoTask
} from "./lib/todo";

const explorerCluster = "devnet";

type TaskMeta = {
  completed: boolean;
  dueDate: string;
};

type TaskMetaMap = Record<string, TaskMeta>;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(value: string): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`)
  );
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(12, 0, 0, 0);
  return result;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWeekDays(): Date[] {
  const firstDay = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    return day;
  });
}

function formatWallet(publicKey: PublicKey | null): string {
  if (!publicKey) {
    return "Not connected";
  }

  const address = publicKey.toBase58();
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function signatureLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${explorerCluster}`;
}

function accountLink(address: PublicKey): string {
  return `https://explorer.solana.com/address/${address.toBase58()}?cluster=${explorerCluster}`;
}

function App() {
  const { connection } = useConnection();
  const { publicKey, connected, disconnecting, disconnect, sendTransaction, signTransaction } =
    useWallet();
  const programId = useMemo(() => getProgramId(), []);

  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [taskId, setTaskId] = useState("1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect a wallet to manage tasks.");
  const [error, setError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletePending, setDeletePending] = useState<TodoTask | null>(null);
  const [taskMeta, setTaskMeta] = useState<TaskMetaMap>({});
  const [taskDueDate, setTaskDueDate] = useState("");

  const editingTask =
    editingKey === null
      ? null
      : tasks.find((task) => task.publicKey.toBase58() === editingKey) ?? null;

  const describedTasks = tasks.filter((task) => task.description.trim().length > 0).length;
  const nextSuggestedId =
    tasks.length === 0 ? "1" : (tasks[tasks.length - 1].id + 1n).toString();
  const walletLabel = connected && publicKey ? formatWallet(publicKey) : "Connect Wallet";
  const weekDays = getWeekDays();
  const completedTasks = tasks.filter((task) => taskMeta[task.publicKey.toBase58()]?.completed).length;
  const weeklyTasks = tasks.filter((task) => {
    const dueDate = taskMeta[task.publicKey.toBase58()]?.dueDate;
    return dueDate && weekDays.some((day) => dateKey(day) === dueDate);
  });

  useEffect(() => {
    if (!connected || !publicKey) {
      setTasks([]);
      setEditingKey(null);
      setStatus("Connect a wallet to load your Devnet tasks.");
      return;
    }

    void refreshTasks();
  }, [connected, publicKey, programId, connection]);

  useEffect(() => {
    if (!publicKey) {
      setTaskMeta({});
      return;
    }

    const storageKey = `solana-tasks-meta:${publicKey.toBase58()}`;
    const savedMeta = window.localStorage.getItem(storageKey);

    try {
      setTaskMeta(savedMeta ? (JSON.parse(savedMeta) as TaskMetaMap) : {});
    } catch {
      setTaskMeta({});
    }
  }, [publicKey]);

  useEffect(() => {
    if (editingKey !== null && editingTask === null) {
      setEditingKey(null);
      setEditTitle("");
      setEditDescription("");
      setEditDueDate("");
    }
  }, [editingKey, editingTask]);

  async function refreshTasks() {
    if (!publicKey) {
      return;
    }

    setError(null);
    setBusyAction((current) => current ?? "refresh");

    try {
      const accounts = await fetchTasksForAuthority(connection, publicKey, programId);
      setTasks(accounts);
      setStatus(
        accounts.length === 0
          ? "No tasks yet. Create one with a signed Devnet transaction."
          : `Loaded ${accounts.length} wallet-scoped task account${
              accounts.length === 1 ? "" : "s"
            }.`
      );
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : "Unable to load tasks.";
      setError(message);
    } finally {
      setBusyAction(null);
    }
  }

  function startEditing(task: TodoTask) {
    setEditingKey(task.publicKey.toBase58());
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditDueDate(taskMeta[task.publicKey.toBase58()]?.dueDate ?? "");
    setError(null);
    setStatus(`Editing task ${task.id.toString()}. Submit a signed update when ready.`);
  }

  function resetEditingState() {
    setEditingKey(null);
    setEditTitle("");
    setEditDescription("");
  }

  function updateTaskMeta(taskPublicKey: string, changes: Partial<TaskMeta>) {
    if (!publicKey) {
      return;
    }

    const nextMeta = {
      ...taskMeta,
      [taskPublicKey]: {
        completed: taskMeta[taskPublicKey]?.completed ?? false,
        dueDate: taskMeta[taskPublicKey]?.dueDate ?? "",
        ...changes
      }
    };
    setTaskMeta(nextMeta);
    window.localStorage.setItem(`solana-tasks-meta:${publicKey.toBase58()}`, JSON.stringify(nextMeta));
  }

  function toggleTaskComplete(task: TodoTask) {
    const key = task.publicKey.toBase58();
    updateTaskMeta(key, { completed: !(taskMeta[key]?.completed ?? false) });
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey || !connected) {
      setError("Connect a wallet before creating a task.");
      return;
    }

    const parsedId = Number(taskId);
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!Number.isInteger(parsedId) || parsedId < 0) {
      setError("Task ID must be a non-negative integer.");
      return;
    }

    if (normalizedTitle.length === 0) {
      setError("Title is required.");
      return;
    }

    if (tasks.some((task) => task.id === BigInt(parsedId))) {
      setError(`Task ${parsedId} already exists for this wallet. Choose another ID.`);
      return;
    }

    setBusyAction("create");
    setError(null);
    setStatus("Waiting for wallet approval to create your task...");

    try {
      const transaction = buildCreateTaskTransaction({
        authority: publicKey,
        id: BigInt(parsedId),
        title: normalizedTitle,
        description: normalizedDescription,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${parsedId} created on Devnet.`);
      setTitle("");
      setDescription("");
      const [createdTaskPda] = deriveTaskPda(programId, publicKey, BigInt(parsedId));
      updateTaskMeta(createdTaskPda.toBase58(), { dueDate: taskDueDate, completed: false });
      setTaskDueDate("");
      setTaskId((BigInt(parsedId) + 1n).toString());
      setIsCreateOpen(false);
      await refreshTasks();
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Create transaction failed.";
      setError(message);
      setStatus("The create flow did not complete.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publicKey || !connected || !editingTask) {
      setError("Choose a task to edit after connecting a wallet.");
      return;
    }

    const nextTitle = editTitle.trim();
    const nextDescription = editDescription.trim();
    const titleChange = nextTitle === editingTask.title ? null : nextTitle;
    const descriptionChange =
      nextDescription === editingTask.description ? null : nextDescription;

    if (nextTitle.length === 0) {
      setError("Title is required.");
      return;
    }

    if (titleChange === null && descriptionChange === null) {
      setError("Change the title or description before sending an update.");
      return;
    }

    setBusyAction("update");
    setError(null);
    setStatus("Waiting for wallet approval to save your changes...");

    try {
      const transaction = buildUpdateTaskTransaction({
        authority: publicKey,
        id: editingTask.id,
        title: titleChange,
        description: descriptionChange,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${editingTask.id.toString()} updated on Devnet.`);
      updateTaskMeta(editingTask.publicKey.toBase58(), { dueDate: editDueDate });
      resetEditingState();
      await refreshTasks();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Update transaction failed.";
      setError(message);
      setStatus("The update flow did not complete.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteTask(task: TodoTask) {
    if (!publicKey || !connected) {
      setError("Connect a wallet before deleting a task.");
      return;
    }

    const deleteKey = `delete-${task.id.toString()}`;
    setBusyAction(deleteKey);
    setError(null);
    setStatus("Waiting for wallet approval to delete your task...");

    try {
      const transaction = buildDeleteTaskTransaction({
        authority: publicKey,
        id: task.id,
        programId
      });

      const signature = await sendAndConfirmWalletTransaction({
        connection,
        payer: publicKey,
        transaction,
        signTransaction,
        sendTransaction
      });

      setLastSignature(signature);
      setStatus(`Task ${task.id.toString()} deleted on Devnet.`);
      setDeletePending(null);

      if (editingKey === task.publicKey.toBase58()) {
        resetEditingState();
      }

      await refreshTasks();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Delete transaction failed.";
      setError(message);
      setStatus("The delete flow did not complete.");
    } finally {
      setBusyAction(null);
    }

  }

      return (
        <div className="app-shell">
          <header className="topbar">
            <a className="brand" href="#dashboard"><span className="brand-mark">✓</span><span>Solana Tasks</span></a>
            <nav className="nav-links"><a className="nav-link nav-link--active" href="#dashboard">Dashboard</a><a className="nav-link" href="#tasks">My Tasks</a></nav>
            <div className="topbar__actions"><span className="network-pill"><i /> Devnet</span><WalletMultiButton>{walletLabel}</WalletMultiButton></div>
          </header>

          <main className="main-content" id="dashboard">
            <section className="dashboard-header">
              <div><p className="eyebrow">Workspace overview</p><h1>Manage your tasks.</h1><p className="lede">Your productivity, secured on Solana.</p></div>
              <button className="primary-button create-button" disabled={!connected || busyAction !== null} onClick={() => { setError(null); setIsCreateOpen(true); }} type="button"><span>＋</span> Create Task</button>
            </section>

            <section className="stats-grid" aria-label="Task statistics">
              <article className="stat-card"><span className="stat-icon">◫</span><div><span className="stat-card__label">Total Tasks</span><strong>{tasks.length}</strong></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--green">↗</span><div><span className="stat-card__label">Active Tasks</span><strong>{tasks.length - completedTasks}</strong></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--dark">◉</span><div><span className="stat-card__label">Wallet Status</span><strong className="stat-status">{connected ? "Connected" : "Disconnected"}</strong></div></article>
            </section>

            <section className="planning-grid" aria-label="Weekly planning">
              <article className="planning-panel weekly-panel">
                <div className="planning-heading"><div><p className="eyebrow">Weekly focus</p><h2>Weekly Tasks</h2></div><span className="planning-count">{weeklyTasks.length} scheduled</span></div>
                <div className="weekly-list">
                  {weeklyTasks.length === 0 ? <p className="planning-empty">Schedule tasks from the create dialog to see them here.</p> : weeklyTasks.map((task) => {
                    const key = task.publicKey.toBase58();
                    const isComplete = taskMeta[key]?.completed ?? false;
                    return <div className={`weekly-task${isComplete ? " weekly-task--done" : ""}`} key={key}><button className={`task-check${isComplete ? " task-check--done" : ""}`} aria-label={isComplete ? "Mark task as active" : "Mark task as done"} onClick={() => toggleTaskComplete(task)} type="button">{isComplete ? "✓" : ""}</button><span>{task.title}</span><small>{formatShortDate(taskMeta[key]?.dueDate ?? "")}</small></div>;
                  })}
                </div>
              </article>
              <article className="planning-panel calendar-panel">
                <div className="planning-heading"><div><p className="eyebrow">Your schedule</p><h2>Calendar</h2></div><span className="calendar-month">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date())}</span></div>
                <div className="calendar-week">{weekDays.map((day) => <div className={`calendar-day${dateKey(day) === todayKey() ? " calendar-day--today" : ""}`} key={dateKey(day)}><span>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong><i>{tasks.filter((task) => taskMeta[task.publicKey.toBase58()]?.dueDate === dateKey(day)).length || ""}</i></div>)}</div>
              </article>
            </section>

            <section className="tasks-section" id="tasks">
              <div className="section-heading"><div><p className="eyebrow">On-chain workspace</p><h2>My tasks <span>{tasks.length}</span></h2></div><div className="section-actions"><button className="icon-button" aria-label="Refresh tasks" disabled={!connected || busyAction !== null} onClick={() => void refreshTasks()} type="button">↻</button><span className="sync-status"><i /> Synced to Devnet</span></div></div>
              {error ? <div className="alert-banner">{error}</div> : null}
              <div className="activity-line"><span className="activity-dot" /> {status}{lastSignature ? <a href={signatureLink(lastSignature)} rel="noreferrer" target="_blank">View transaction ↗</a> : null}</div>
              <div className="task-list">
                {tasks.length === 0 ? <div className="empty-state empty-state--large"><div className="empty-icon">✓</div><p>No tasks yet.</p><span>Start organizing your productivity by creating your first task.</span><button className="ghost-button" disabled={!connected} onClick={() => setIsCreateOpen(true)} type="button">Create your first task</button></div> : tasks.map((task) => {
                  const isEditing = editingKey === task.publicKey.toBase58();
                  const taskKey = task.publicKey.toBase58();
                  const isComplete = taskMeta[taskKey]?.completed ?? false;
                  return <article className={`task-card${isEditing ? " task-card--active" : ""}${isComplete ? " task-card--complete" : ""}`} key={taskKey}><span className="task-indicator" /><div className="task-card__body"><div className="task-card__header"><div className="task-title-row"><button className={`task-check${isComplete ? " task-check--done" : ""}`} aria-label={isComplete ? "Mark task as active" : "Mark task as done"} onClick={() => toggleTaskComplete(task)} type="button">{isComplete ? "✓" : ""}</button><div><h3>{task.title || "Untitled task"}</h3><p className="task-card__description">{task.description || "No description saved."}</p></div></div><div className="task-card__actions"><button className="text-button" disabled={!connected || busyAction !== null} onClick={() => startEditing(task)} type="button">Edit</button><button className="text-button text-button--danger" disabled={!connected || busyAction !== null} onClick={() => setDeletePending(task)} type="button">{busyAction === `delete-${task.id.toString()}` ? "Deleting..." : "Delete"}</button></div></div><div className="task-card__meta"><span>Task ID: #{task.id.toString()}</span><span className="due-date">{taskMeta[taskKey]?.dueDate ? `Due ${formatShortDate(taskMeta[taskKey].dueDate)}` : "No due date"}</span><span>{formatWallet(task.authority)}</span><a href={accountLink(task.publicKey)} rel="noreferrer" target="_blank">View on Explorer ↗</a></div></div></article>;
                })}
              </div>
            </section>
          </main>

          {isCreateOpen ? <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-heading"><button className="modal-close" aria-label="Close" onClick={() => setIsCreateOpen(false)} type="button">×</button><p className="eyebrow">New task</p><h2 id="create-heading">Create a new task</h2><p className="modal-copy">Add a task to your wallet-owned workspace on Devnet.</p><form className="task-form" onSubmit={handleCreateTask}><label>Task ID<input inputMode="numeric" min="0" onChange={(event) => setTaskId(event.target.value)} type="number" value={taskId} /></label><label>Title<input autoFocus maxLength={64} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" value={title} /></label><label>Description<textarea maxLength={64} onChange={(event) => setDescription(event.target.value)} placeholder="Add a little context" rows={4} value={description} /></label><label>Due date<input min={todayKey()} onChange={(event) => setTaskDueDate(event.target.value)} type="date" value={taskDueDate} /></label><div className="form-actions"><button className="ghost-button" onClick={() => setIsCreateOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={!connected || busyAction !== null} type="submit">{busyAction === "create" ? "Saving..." : "Save Task"}</button></div></form></div></div> : null}
          {editingTask ? <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-heading"><button className="modal-close" aria-label="Close" onClick={resetEditingState} type="button">×</button><p className="eyebrow">Task #{editingTask.id.toString()}</p><h2 id="edit-heading">Edit task</h2><form className="task-form" onSubmit={handleUpdateTask}><label>Title<input autoFocus maxLength={64} onChange={(event) => setEditTitle(event.target.value)} value={editTitle} /></label><label>Description<textarea maxLength={64} onChange={(event) => setEditDescription(event.target.value)} rows={4} value={editDescription} /></label><label>Due date<input min={todayKey()} onChange={(event) => setEditDueDate(event.target.value)} type="date" value={editDueDate} /></label><div className="form-actions"><button className="ghost-button" onClick={resetEditingState} type="button">Cancel</button><button className="primary-button" disabled={!connected || busyAction !== null} type="submit">{busyAction === "update" ? "Saving..." : "Save changes"}</button></div></form></div></div> : null}
          {deletePending ? <div className="modal-backdrop" role="presentation"><div className="modal modal--confirm" role="dialog" aria-modal="true" aria-labelledby="delete-heading"><div className="confirm-icon">!</div><h2 id="delete-heading">Delete this task?</h2><p className="modal-copy">This action will permanently remove the task from the blockchain.</p><div className="form-actions"><button className="ghost-button" onClick={() => setDeletePending(null)} type="button">Cancel</button><button className="danger-button" disabled={busyAction !== null} onClick={() => void handleDeleteTask(deletePending)} type="button">{busyAction ? "Deleting..." : "Delete Task"}</button></div></div></div> : null}
        </div>
      );
}

export default App;
