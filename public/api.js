// ===== Talking to the server =====
// Every page includes this file. It remembers who is logged in (in this browser) and sends requests with fetch().
//   const view = await api.get('/data');                       // ask for data
//   const saved = await api.post('/action/payReservation', {}) // ask the server to do something

const AUTH_KEY = 'catcafe_auth';       // the name this browser uses to remember the login

function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; }
}
function saveAuth(data) { localStorage.setItem(AUTH_KEY, JSON.stringify(data)); }      // data = { token, user }
function clearAuth() { localStorage.removeItem(AUTH_KEY); }

// When the server says no, the page gets one of these. e.messages is a list of messages to show.
class ApiError extends Error {
  constructor(status, messages) {
    super(messages[0]);
    this.status = status;
    this.messages = messages;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const auth = getAuth();
  if (auth && auth.token) headers.Authorization = 'Bearer ' + auth.token;     // "here is my login token"

  let response;
  try {
    response = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiError(0, ['Could not reach the server. Is it running?']);
  }
  let data = null;
  try { data = await response.json(); } catch (e) { /* the answer had no data */ }

  if (!response.ok) {
    if (response.status === 401 && auth && path !== '/auth/login') clearAuth();      // the login has expired
    throw new ApiError(response.status, (data && (data.errors || [data.error])) || ['Something went wrong.']);
  }
  return data;
}

const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body)
};

// The first message of an error, for showing on the page
function errorText(e) {
  return e && e.messages ? e.messages[0] : 'Something went wrong.';
}
