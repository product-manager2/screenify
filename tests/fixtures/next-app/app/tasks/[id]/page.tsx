export default function TaskDetail() {
  async function onDelete() { await fetch('/api/tasks/1', { method: 'DELETE' }); }
  return <button onClick={onDelete}>Delete</button>;
}
