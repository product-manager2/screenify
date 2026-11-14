import { page } from '../shell.mjs';

/** Notes at /notes: a rich-text composer (contenteditable) and a feed the saved notes appear in. */
export const notesPage = () => page('Notes', `<main><h1>Notes</h1>
<div id="composer" contenteditable="true" role="textbox" aria-label="New note" style="border:1px solid #8888;border-radius:8px;padding:10px;min-height:48px"></div>
<p><button id="save">Save note</button></p>
<section aria-label="Feed"><ul id="feed"></ul></section></main>
<script>document.getElementById('save').onclick=()=>{const c=document.getElementById('composer');const li=document.createElement('li');
li.textContent=c.textContent;document.getElementById('feed').appendChild(li);c.textContent=''};</script>`);

/** A month view at /calendar/:year/:month; /calendar redirects here. */
export const calendarPage = (year, month) => page('Calendar', `<main><h1>Calendar</h1><p>${year}-${month}</p></main>`);
