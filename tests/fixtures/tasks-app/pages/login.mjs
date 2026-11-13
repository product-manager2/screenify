import { page } from '../shell.mjs';

/** Sign-in form at /login; posting the right password sets the session cookie and redirects to /tasks. */
export const loginPage = (error = '') => page('Sign in', `<main><h1>Sign in</h1>${error ? `<p role="alert">${error}</p>` : ''}<form method="post" action="/login"><label for="email">Email</label><input id="email" name="email">
<label for="password">Password</label><input id="password" name="password" type="password"><button type="submit">Sign in</button></form></main>`);
