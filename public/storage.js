// ===== The website's copy of the data =====
// The rules (data.js and bookings.js) read and write the data with two functions: readKey and writeKey.
// On the SERVER they work on the database. Here in the BROWSER they work on a copy that the server sent us
// (only what this person may see: see lib/views.js on the server).
//   - Reading is instant, so pages can show availability without waiting.
//   - The admin's edit pages save a whole list: writeKey updates the copy and sends it to the server.
//   - Everything with rules (booking, paying, cancelling, ...) goes to the server instead (actions.js).
// Needs api.js loaded first.

var USERS = [];             // the cat handlers (sent by the server; the rules use this list)
var DATA = {};              // the copy of the data
const ADMIN_SAVED = ['rooms', 'sessions', 'rates', 'holidays', 'cats', 'events', 'menuItems', 'faq', 'feedbackMessages', 'openHours', 'settings'];

const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
function readKey(key, fallback) { return DATA[key] === undefined ? fallback : clone(DATA[key]); }
function writeKey(key, value) {
  DATA[key] = clone(value);
  const user = currentUser();
  if (user && user.role === 'admin' && ADMIN_SAVED.includes(key)) queueSave(key);
}

// ----- saving an admin list (a moment after the last change, so quick changes go in one request) -----
const saveTimers = {};
function queueSave(key) {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => saveKey(key), 150);
}
async function saveKey(key) {
  delete saveTimers[key];
  try {
    await api.put('/collection/' + key, { value: DATA[key] });
  } catch (e) {
    if (window.uiAlert) await uiAlert('That could not be saved: ' + errorText(e)); else alert('That could not be saved: ' + errorText(e));
    try { await refreshData(); window.location.reload(); } catch (e2) { /* the page stays as it is */ }
  }
}
async function flushSaves() {                       // send anything still waiting, before we ask for fresh data
  for (const key of Object.keys(saveTimers)) { clearTimeout(saveTimers[key]); await saveKey(key); }
}

// ----- getting a fresh copy from the server -----
async function refreshData() {
  await flushSaves();
  const view = await api.get('/data');
  DATA = view.data;
  USERS.length = 0;
  view.staff.forEach(s => USERS.push(s));
  if (getAuth() && !view.me) clearAuth();           // the server no longer knows this login (expired): act as a visitor
  return view;
}

// Page scripts run inside onDataReady(...), so the data is there before they start.
const dataReady = refreshData().then(() => true, e => { window.__loadError = errorText(e); return false; });
function onDataReady(start) {
  dataReady.then(function (ok) {
    if (ok) { start(); return; }
    const main = document.querySelector('main');
    if (main) main.innerHTML = '<div class="card msg-error">' + (window.__loadError || 'Could not load the data.') + ' Please try again in a moment.</div>';
  });
}

const cats = loadCats();
const cat = cats.find(c => c.id === catId);
if (cat) {
  cat.notes.push('New note');
  saveCats(cats);
}
