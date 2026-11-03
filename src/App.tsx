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
  fetchTasksForAuthority,
  getProgramId,
  sendAndConfirmWalletTransaction,
  type TodoTask
} from "./lib/todo";

const explorerCluster = "devnet";

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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect a wallet to manage tasks.");
  const [error, setError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletePending, setDeletePending] = useState<TodoTask | null>(null);

  const editingTask =
    editingKey === null
      ? null
      : tasks.find((task) => task.publicKey.toBase58() === editingKey) ?? null;

  const describedTasks = tasks.filter((task) => task.description.trim().length > 0).length;
  const nextSuggestedId =
    tasks.length === 0 ? "1" : (tasks[tasks.length - 1].id + 1n).toString();

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
    if (editingKey !== null && editingTask === null) {
      setEditingKey(null);
      setEditTitle("");
      setEditDescription("");
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
    setError(null);
    setStatus(`Editing task ${task.id.toString()}. Submit a signed update when ready.`);
  }

  function resetEditingState() {
    setEditingKey(null);
    setEditTitle("");
    setEditDescription("");
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
            <div className="topbar__actions"><span className="network-pill"><i /> Devnet</span><WalletMultiButton /></div>
          </header>

          <main className="main-content" id="dashboard">
            <section className="dashboard-header">
              <div><p className="eyebrow">Workspace overview</p><h1>Manage your tasks.</h1><p className="lede">Your productivity, secured on Solana.</p></div>
              <button className="primary-button create-button" disabled={!connected || busyAction !== null} onClick={() => { setError(null); setIsCreateOpen(true); }} type="button"><span>＋</span> Create Task</button>
            </section>

            <section className="stats-grid" aria-label="Task statistics">
              <article className="stat-card"><span className="stat-icon">◫</span><div><span className="stat-card__label">Total Tasks</span><strong>{tasks.length}</strong></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--green">↗</span><div><span className="stat-card__label">Active Tasks</span><strong>{tasks.length}</strong></div></article>
              <article className="stat-card"><span className="stat-icon stat-icon--dark">◉</span><div><span className="stat-card__label">Wallet Status</span><strong className="stat-status">{connected ? "Connected" : "Disconnected"}</strong></div></article>
            </section>

            <section className="tasks-section" id="tasks">
              <div className="section-heading"><div><p className="eyebrow">On-chain workspace</p><h2>My tasks <span>{tasks.length}</span></h2></div><div className="section-actions"><button className="icon-button" aria-label="Refresh tasks" disabled={!connected || busyAction !== null} onClick={() => void refreshTasks()} type="button">↻</button><span className="sync-status"><i /> Synced to Devnet</span></div></div>
              {error ? <div className="alert-banner">{error}</div> : null}
              <div className="activity-line"><span className="activity-dot" /> {status}{lastSignature ? <a href={signatureLink(lastSignature)} rel="noreferrer" target="_blank">View transaction ↗</a> : null}</div>
              <div className="task-list">
                {tasks.length === 0 ? <div className="empty-state empty-state--large"><div className="empty-icon">✓</div><p>No tasks yet.</p><span>Start organizing your productivity by creating your first task.</span><button className="ghost-button" disabled={!connected} onClick={() => setIsCreateOpen(true)} type="button">Create your first task</button></div> : tasks.map((task) => {
                  const isEditing = editingKey === task.publicKey.toBase58();
                  return <article className={`task-card${isEditing ? " task-card--active" : ""}`} key={task.publicKey.toBase58()}><span className="task-indicator" /><div className="task-card__body"><div className="task-card__header"><div><h3>{task.title || "Untitled task"}</h3><p className="task-card__description">{task.description || "No description saved."}</p></div><div className="task-card__actions"><button className="text-button" disabled={!connected || busyAction !== null} onClick={() => startEditing(task)} type="button">Edit</button><button className="text-button text-button--danger" disabled={!connected || busyAction !== null} onClick={() => setDeletePending(task)} type="button">{busyAction === `delete-${task.id.toString()}` ? "Deleting..." : "Delete"}</button></div></div><div className="task-card__meta"><span>Task ID: #{task.id.toString()}</span><span>{formatWallet(task.authority)}</span><a href={accountLink(task.publicKey)} rel="noreferrer" target="_blank">View on Explorer ↗</a></div></div></article>;
                })}
              </div>
            </section>
          </main>

          {isCreateOpen ? <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-heading"><button className="modal-close" aria-label="Close" onClick={() => setIsCreateOpen(false)} type="button">×</button><p className="eyebrow">New task</p><h2 id="create-heading">Create a new task</h2><p className="modal-copy">Add a task to your wallet-owned workspace on Devnet.</p><form className="task-form" onSubmit={handleCreateTask}><label>Task ID<input inputMode="numeric" min="0" onChange={(event) => setTaskId(event.target.value)} type="number" value={taskId} /></label><label>Title<input autoFocus maxLength={64} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" value={title} /></label><label>Description<textarea maxLength={64} onChange={(event) => setDescription(event.target.value)} placeholder="Add a little context" rows={4} value={description} /></label><div className="form-actions"><button className="ghost-button" onClick={() => setIsCreateOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={!connected || busyAction !== null} type="submit">{busyAction === "create" ? "Saving..." : "Save Task"}</button></div></form></div></div> : null}
          {editingTask ? <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-heading"><button className="modal-close" aria-label="Close" onClick={resetEditingState} type="button">×</button><p className="eyebrow">Task #{editingTask.id.toString()}</p><h2 id="edit-heading">Edit task</h2><form className="task-form" onSubmit={handleUpdateTask}><label>Title<input autoFocus maxLength={64} onChange={(event) => setEditTitle(event.target.value)} value={editTitle} /></label><label>Description<textarea maxLength={64} onChange={(event) => setEditDescription(event.target.value)} rows={4} value={editDescription} /></label><div className="form-actions"><button className="ghost-button" onClick={resetEditingState} type="button">Cancel</button><button className="primary-button" disabled={!connected || busyAction !== null} type="submit">{busyAction === "update" ? "Saving..." : "Save changes"}</button></div></form></div></div> : null}
          {deletePending ? <div className="modal-backdrop" role="presentation"><div className="modal modal--confirm" role="dialog" aria-modal="true" aria-labelledby="delete-heading"><div className="confirm-icon">!</div><h2 id="delete-heading">Delete this task?</h2><p className="modal-copy">This action will permanently remove the task from the blockchain.</p><div className="form-actions"><button className="ghost-button" onClick={() => setDeletePending(null)} type="button">Cancel</button><button className="danger-button" disabled={busyAction !== null} onClick={() => void handleDeleteTask(deletePending)} type="button">{busyAction ? "Deleting..." : "Delete Task"}</button></div></div></div> : null}
        </div>
      );
}

export default App;
