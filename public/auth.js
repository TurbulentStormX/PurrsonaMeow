// Who is logged in, in this browser. (The server is what really decides: it checks the login token on every
// request, so changing anything here only changes what the page SHOWS, never what the person may do.)
// Needs api.js loaded first.

function currentUser() {
  const auth = getAuth();
  return auth ? auth.user : null;
}
function logout() {
  clearAuth();
  window.location.href = 'login.html';
}

// The three kinds of users: 'guest', 'handler' and 'admin'. (A visitor who is not logged in has no role.)
// Which page each role starts on after logging in
function homePageFor(role) {
  if (role === 'admin') return 'admin.html';
  if (role === 'handler') return 'handler.html';
  return 'booking.html';
}

// ----- Password rules (the server checks them too) -----
const PASSWORD_RULES = [
  { text: '8 to 12 characters',                         test: p => p.length >= 8 && p.length <= 12 },
  { text: 'An uppercase letter (A-Z)',                  test: p => /[A-Z]/.test(p) },
  { text: 'A lowercase letter (a-z)',                   test: p => /[a-z]/.test(p) },
  { text: 'A number (0-9)',                             test: p => /[0-9]/.test(p) },
  { text: 'A special character, for example ! @ # $ %', test: p => /[^A-Za-z0-9\s]/.test(p) },
  { text: 'No spaces',                                  test: p => !/\s/.test(p) }
];
function passwordProblem(password) {
  const missing = PASSWORD_RULES.filter(r => !r.test(password)).map(r => r.text);
  return missing.length === 0 ? '' : 'Your password needs: ' + missing.join('; ') + '.';
}
// A live checklist under a password box. Each rule turns green when it is met.
function showPasswordChecklist(input, list) {
  list.innerHTML = '';
  const items = PASSWORD_RULES.map(function (rule) {
    const li = document.createElement('li');
    li.textContent = rule.text;
    list.appendChild(li);
    return li;
  });
  function update() { PASSWORD_RULES.forEach((rule, i) => items[i].classList.toggle('met', rule.test(input.value))); }
  input.addEventListener('input', update);
  update();
}

// Page guard. If this visitor is allowed, it returns true.
// If not, it replaces the page content with a friendly message and returns false.
function guardPage(allowedRoles, wantsTo) {
  const user = currentUser();
  if (user && allowedRoles.includes(user.role)) return true;

  const main = document.querySelector('main');
  main.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card';
  const title = document.createElement('h1');
  const text = document.createElement('p');
  box.appendChild(title);
  box.appendChild(text);

  function button(label, href) {
    const a = document.createElement('a');
    a.className = 'cta';
    a.href = href;
    a.textContent = label;
    a.style.marginRight = '8px';
    box.appendChild(a);
  }

  if (!user) {
    title.textContent = 'Please log in';
    text.textContent = allowedRoles.includes('guest')
      ? 'Log in or sign up to ' + wantsTo + '. Without an account you can still look at Events, the Menu and our cats.'
      : 'This page is for staff. Please log in with a staff account.';
    button('Log in', 'login.html');
    if (allowedRoles.includes('guest')) button('Sign up', 'signup.html');
  } else {
    title.textContent = 'This page is not for your account';
    text.textContent = 'You are logged in as ' + user.name + '. This page is only for ' + allowedRoles.join(' / ') + ' accounts.';
    button('Go to my page', homePageFor(user.role));
  }
  main.appendChild(box);
  return false;
}
