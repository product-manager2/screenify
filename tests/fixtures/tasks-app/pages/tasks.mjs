import { newTaskDialog, newTaskDialogScript } from '../components/new-task-dialog.mjs';
import { page } from '../shell.mjs';

/** Task list at /tasks: the list, an empty state when there are none, and the New task button. */
export const tasksPage = () => page('Tasks', `<header><strong>Taskly</strong><nav><a href="/">Home</a></nav></header>
<main><div style="display:flex;justify-content:space-between;align-items:center"><h1>Tasks</h1><button id="new">New task</button></div>
<ul id="list"></ul><p class="empty" id="empty" hidden>No tasks yet. Create your first one.</p></main>
${newTaskDialog}
<script>
async function load(){const r=await fetch('/api/tasks');const t=await r.json();const ul=document.getElementById('list');ul.innerHTML='';
for(const x of t){const li=document.createElement('li');li.textContent=x.title;ul.appendChild(li)}document.getElementById('empty').hidden=t.length>0}
${newTaskDialogScript}
load();
</script>`);
