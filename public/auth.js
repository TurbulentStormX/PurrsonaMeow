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

  // Keep the existing access permission check
  if (user && allowedRoles.includes(user.role)) {
    return true;
  }

  const main = document.querySelector('main');
  if (!main) return false;

  // Load the existing login design stylesheet
  if (!document.querySelector('link[href="auth-design.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'auth-design.css';
    document.head.appendChild(stylesheet);
  }

  main.innerHTML = '';
  main.classList.add('auth-page', 'auth-access');

  // Welcome header
  const intro = document.createElement('section');
  intro.className = 'auth-intro';

  const kicker = document.createElement('span');
  kicker.className = 'auth-kicker';
  kicker.textContent = 'PURRSONA MEOW · CAT CAFÉ';

  const welcome = document.createElement('h2');
  welcome.textContent = 'Welcome';

  const subtitle = document.createElement('p');
  subtitle.textContent =
    'Please sign in to continue your purrfect café experience.';

  intro.append(kicker, welcome, subtitle);

  // Login prompt card
  const box = document.createElement('div');
  box.className = 'card auth-card';

  const title = document.createElement('h1');
  const description = document.createElement('p');
  description.className = 'auth-description';

  box.append(title, description);

  const actions = document.createElement('div');
  actions.className = 'auth-access-actions';

  function button(label, href, secondary = false) {
    const a = document.createElement('a');
    a.className = secondary
      ? 'cta auth-access-secondary'
      : 'cta';

    a.href = href;
    a.textContent = label;
    actions.appendChild(a);
  }

  if (!user) {
    title.textContent = 'Please log in';

    if (allowedRoles.includes('guest')) {
      description.textContent =
        'Log in or sign up to ' + wantsTo +
        '. You can still explore our events, menu and cats without an account.';

      button('Log in', 'login.html');
      button('Create an account', 'signup.html', true);

    } else {
      description.textContent =
        'This area is reserved for authorised staff. ' +
        'Please log in with your staff account.';

      button('Staff Login', 'login.html');
    }

  } else {
    title.textContent = 'Account access';

    description.textContent =
      'You are logged in as ' + user.name +
      '. This page is only available to ' +
      allowedRoles.join(' / ') + ' accounts.';

    button('Go to my page', homePageFor(user.role));
  }

  box.appendChild(actions);
  main.append(intro, box);

  return false;
}
