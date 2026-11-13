// The "New task" dialog: markup and the script that opens it and posts the new task.
export const newTaskDialog = `<dialog id="dlg"><form id="form" method="dialog"><h2>New task</h2><label for="title">Title</label><input id="title" name="title" autocomplete="off">
<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="cancel" style="background:#888">Cancel</button><button type="submit">Save task</button></div></form></dialog>`;

export const newTaskDialogScript = `document.getElementById('new').onclick=()=>document.getElementById('dlg').showModal();
document.getElementById('cancel').onclick=()=>document.getElementById('dlg').close();
document.getElementById('form').onsubmit=async(e)=>{e.preventDefault();const title=document.getElementById('title').value;
await fetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});document.getElementById('dlg').close();document.getElementById('title').value='';load()};`;
