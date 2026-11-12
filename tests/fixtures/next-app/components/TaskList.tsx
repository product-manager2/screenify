import { TaskRow } from './TaskRow';
export function TaskList({ tasks = [] }) {
  if (tasks.length === 0) return <p>No tasks yet</p>;
  return <form onSubmit={() => createTask()}>{tasks.map((t) => <TaskRow key={t.id} task={t} />)}</form>;
}
function createTask() {}
