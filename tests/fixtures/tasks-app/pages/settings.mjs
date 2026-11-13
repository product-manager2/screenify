import { page } from '../shell.mjs';

/** Settings at /settings: the page itself never scrolls; a fixed-height inner panel holds forty sections. */
export const settingsPage = () => {
  const sections = Array.from({ length: 40 }, (_, i) => `<section style="padding:16px;border-bottom:1px solid #8884"><h2>Setting ${i + 1}</h2><p>Option ${i + 1}</p></section>`).join('');
  return page('Settings', `<div style="height:100vh;overflow:hidden;display:flex;flex-direction:column"><header><strong>Settings</strong></header>
<div id="panel" style="flex:1;overflow:auto">${sections}<p>End of settings</p></div></div>
<div class="dev-badge" style="position:fixed;bottom:8px;left:8px;background:red;color:#fff;padding:4px 8px">DEV</div>`);
};
