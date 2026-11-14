import { page } from '../shell.mjs';

/** Landing page at /: a link to the tasks, and two buttons whose names overlap ("Filters", "Open filters"). */
export const homePage = () => page('Taskly', `<main><h1>Welcome to Taskly</h1><p><a href="/tasks">Open your tasks</a></p>
<p><button id="open-filters" onclick="document.getElementById('picked').textContent='Picked: open filters'">Open filters</button>
<button id="filters" onclick="document.getElementById('picked').textContent='Picked: filters'">Filters</button></p><p id="picked"></p></main>`);
