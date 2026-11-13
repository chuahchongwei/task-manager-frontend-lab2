// Main page: connection banner, task form, status filter and task list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createTask, deleteTask, listTasks, updateTask } from './api.js';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import StatusFilter from './components/StatusFilter.jsx';
import TaskForm from './components/TaskForm.jsx';
import TaskList from './components/TaskList.jsx';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState(''); // '' = all statuses
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  const loadTasks = useCallback(async () => {
    // If you click filters quickly, only the newest answer may update the list.
    const requestId = ++latestRequest.current;
    const isLatest = () => requestId === latestRequest.current;
    setLoading(true);
    try {
      const result = await listTasks(filter);
      if (isLatest()) {
        setTasks(Array.isArray(result) ? result : []);
        setError('');
      }
    } catch (err) {
      if (isLatest()) setError(err.message);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleCreate(values) {
    await createTask(values); // errors are shown inside the form
    await loadTasks();
  }

  async function handleUpdate(values) {
    await updateTask(editingTask.id, values);
    setEditingTask(null);
    await loadTasks();
  }

  async function handleStatusChange(task, status) {
    try {
      await updateTask(task.id, { ...task, status });
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await deleteTask(task.id);
      if (editingTask?.id === task.id) setEditingTask(null);
      await loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app">
      <ConnectionStatus />

      <header className="app-header">
        <h1>Task Manager</h1>
        <p>React on AWS Amplify · Node.js on EC2 · MySQL on RDS</p>
      </header>

      <main className="layout">
        <section>
          {editingTask ? (
            // `key` resets the form when you switch to editing a different task
            <TaskForm key={editingTask.id} task={editingTask} onSave={handleUpdate} onCancel={() => setEditingTask(null)} />
          ) : (
            <TaskForm onSave={handleCreate} />
          )}
        </section>

        <section>
          <StatusFilter value={filter} onChange={setFilter} />
          {error && <p className="list-error">{error}</p>}
          {/* Hide the "No tasks" message when the list is empty only because loading failed */}
          {!(error && tasks.length === 0) && (
            <TaskList
              tasks={tasks}
              loading={loading}
              onStatusChange={handleStatusChange}
              onEdit={setEditingTask}
              onDelete={handleDelete}
            />
          )}
        </section>
      </main>
    </div>
  );
}
