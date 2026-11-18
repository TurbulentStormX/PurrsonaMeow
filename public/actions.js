// ===== Things the server must decide =====
// In bookings.js these are plain functions. Here the SAME names ask the server to do them (the server runs
// the same rules on the real data and answers { ok: true, ... } or { ok: false, error: '...' }).
// They are async: put "await" in front when you call them.
// Needs api.js and storage.js loaded first.

async function serverAction(name, args) {
  let answer;
  try {
    answer = await api.post('/action/' + name, args || {});
  } catch (e) {
    answer = { ok: false, error: errorText(e) };
  }
  try { await refreshData(); } catch (e) { /* keep the copy we have */ }           // the data has probably changed
  return answer;
}

// (function declarations, so they replace the plain versions from bookings.js of the same name)
async function createReservation(user, f) { return serverAction('createReservation', { f }); }
async function cancelReservation(code) { return serverAction('cancelReservation', { code }); }
async function payReservation(code, method) { return serverAction('payReservation', { code, method }); }
async function editReservation(code, changes) { return serverAction('editReservation', { code, changes }); }
async function addLeave(username, start, end, reason, note) { return serverAction('addLeave', { username, start, end, reason, note }); }
async function removeLeave(id) { return serverAction('removeLeave', { id }); }
async function replaceCatInUpcomingBookings(catId) { return serverAction('replaceCatInUpcomingBookings', { catId }); }
async function addReview(code, email, data) { return serverAction('addReview', { code, data }); }
async function concludeReservation(code, username, checkedIn) { return serverAction('concludeReservation', { code, checkedIn }); }
async function placeOrder(user, reservationCode, lines) { return serverAction('placeOrder', { reservationCode, lines }); }
async function markOrderServed(code) { return serverAction('markOrderServed', { code }); }
async function subscribe(user, tierId) { return serverAction('subscribe', { tierId }); }
async function cancelSubscription() { return serverAction('cancelSubscription', {}); }
async function submitFeedback(f) { return serverAction('submitFeedback', { f }); }
async function clearPracticeData() { return serverAction('clearPracticeData', {}); }

function upgradeOldBookings() { /* the server looks after this */ }
