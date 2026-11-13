import { page } from '../shell.mjs';

/** Landing page at /. */
export const homePage = () => page('Taskly', '<main><h1>Welcome to Taskly</h1><p><a href="/tasks">Open your tasks</a></p></main>');
