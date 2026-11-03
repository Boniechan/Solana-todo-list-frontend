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
import { DeleteModal } from "./components/DeleteModal";
import { StatsCards } from "./components/StatsCards";
import { TaskList } from "./components/TaskList";
import { TaskModal } from "./components/TaskModal";
import { WeeklyCalendar } from "./components/WeeklyCalendar";
import { todayKey, type TaskMeta, type TaskMetaMap } from "./components/taskTypes";

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

function findAvailableTaskId(tasks: TodoTask[], requestedId: number): number {
  const usedIds = new Set(tasks.map((task) => Number(task.id)));
  let nextId = requestedId;

  while (usedIds.has(nextId)) {
    nextId += 1;
  }

  return nextId;
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
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [activeView, setActiveView] = useState<"dashboard" | "tasks">("dashboard");

  const editingTask =
    editingKey === null
      ? null
      : tasks.find((task) => task.publicKey.toBase58() === editingKey) ?? null;

  const describedTasks = tasks.filter((task) => task.description.trim().length > 0).length;
  const nextSuggestedId =
    tasks.length === 0 ? "1" : (tasks[tasks.length - 1].id + 1n).toString();
  const walletLabel = connected && publicKey ? formatWallet(publicKey) : "Connect Wallet";
  const completedTasks = tasks.filter((task) => taskMeta[task.publicKey.toBase58()]?.completed).length;

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
      const highestId = accounts.reduce(
        (highest, task) => Math.max(highest, Number(task.id)),
        0
      );
      setTaskId((currentId) => {
        const current = Number(currentId);
        return Number.isInteger(current) && current > highestId
          ? currentId
          : (highestId + 1).toString();
      });
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
    setEditDueDate("");
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

    const requestedId = Number(taskId);
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!Number.isInteger(requestedId) || requestedId < 0) {
      setError("Task ID must be a non-negative integer.");
      return;
    }

    const parsedId = findAvailableTaskId(tasks, requestedId);

    if (normalizedTitle.length === 0) {
      setError("Title is required.");
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
      setStatus(
        parsedId === requestedId
          ? `Task ${parsedId} created on Devnet.`
          : `Task ID ${requestedId} already existed. Created task ${parsedId} on Devnet.`
      );
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

    if (titleChange === null && descriptionChange === null && editDueDate === (taskMeta[editingTask.publicKey.toBase58()]?.dueDate ?? "")) {
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

      const openCreateModal = () => {
        setError(null);
        setIsCreateOpen(true);
      };

      return (
        <div className="app-shell">
          <header className="topbar">
            <a className="brand" href="#dashboard"><span className="brand-mark">✓</span><span>Solana Tasks</span></a>
            <nav className="nav-links"><button className={`nav-link${activeView === "dashboard" ? " nav-link--active" : ""}`} onClick={() => setActiveView("dashboard")} type="button">Dashboard</button><button className={`nav-link${activeView === "tasks" ? " nav-link--active" : ""}`} onClick={() => setActiveView("tasks")} type="button">My Tasks</button></nav>
            <div className="topbar__actions"><span className="network-pill"><i /> Devnet</span><WalletMultiButton>{walletLabel}</WalletMultiButton></div>
          </header>
          <main className="main-content" id="dashboard">
            <section className="dashboard-header"><div><p className="eyebrow">{activeView === "dashboard" ? "Workspace overview" : "On-chain workspace"}</p><h1>{activeView === "dashboard" ? "Manage your tasks." : "My tasks."}</h1><p className="lede">{activeView === "dashboard" ? "Your productivity, secured on Solana." : "Every task, status, and due date in one place."}</p></div><button className="primary-button create-button" disabled={!connected || busyAction !== null} onClick={openCreateModal} type="button"><span>＋</span> Create Task</button></section>
            <StatsCards total={tasks.length} active={tasks.length - completedTasks} connected={connected} />
            {activeView === "dashboard" ? <WeeklyCalendar tasks={tasks} taskMeta={taskMeta} selectedDate={selectedDate} onSelectDate={setSelectedDate} onToggleComplete={toggleTaskComplete} /> : null}
            <section className="tasks-section" id="tasks"><div className="section-heading"><div><p className="eyebrow">{activeView === "dashboard" ? "Recent activity" : "Wallet-scoped tasks"}</p><h2>{activeView === "dashboard" ? "Recent tasks" : "All tasks"} <span>{tasks.length}</span></h2></div><div className="section-actions"><button className="icon-button" aria-label="Refresh tasks" disabled={!connected || busyAction !== null} onClick={() => void refreshTasks()} type="button">↻</button><span className="sync-status"><i /> Synced to Devnet</span></div></div>{error ? <div className="alert-banner">{error}</div> : null}<div className="activity-line"><span className="activity-dot" /> {status}{lastSignature ? <a href={signatureLink(lastSignature)} rel="noreferrer" target="_blank">View transaction ↗</a> : null}</div><TaskList tasks={tasks} taskMeta={taskMeta} connected={connected} busyAction={busyAction} onEdit={startEditing} onDelete={setDeletePending} onToggleComplete={toggleTaskComplete} onCreate={openCreateModal} accountLink={accountLink} /></section>
          </main>
          {isCreateOpen ? <TaskModal mode="create" editingTask={null} title={title} description={description} dueDate={taskDueDate} connected={connected} busyAction={busyAction} onTitleChange={setTitle} onDescriptionChange={setDescription} onDueDateChange={setTaskDueDate} onSubmit={handleCreateTask} onClose={() => setIsCreateOpen(false)} /> : null}
          {editingTask ? <TaskModal mode="edit" editingTask={editingTask} title={editTitle} description={editDescription} dueDate={editDueDate} connected={connected} busyAction={busyAction} onTitleChange={setEditTitle} onDescriptionChange={setEditDescription} onDueDateChange={setEditDueDate} onSubmit={handleUpdateTask} onClose={resetEditingState} /> : null}
          {deletePending ? <DeleteModal task={deletePending} busy={busyAction !== null} onCancel={() => setDeletePending(null)} onConfirm={() => void handleDeleteTask(deletePending)} /> : null}
        </div>
      );
}

export default App;
