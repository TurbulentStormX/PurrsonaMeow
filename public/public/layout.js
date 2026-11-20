// Needs auth.js loaded first (for currentUser and logout).
// Draws the header, the fixed side menu (with a search box for screens), and the footer on every page.

// The address of the dashboard (the React app). It is told where THIS website lives, so its
// "Back to main page" button always returns to the right place, whatever address Live Server uses.
const DASHBOARD_URL = '/dashboard/';           // the React dashboard, served by this same server once it is built (see docs/REACT.md)
function dashboardUrl() {
  const here = window.location.href.split('#')[0].split('?')[0];
  return DASHBOARD_URL + '?back=' + encodeURIComponent(here.replace(/[^\/]*$/, 'index.html'));
}

// Every screen, for the menu and for the search box: [file, title, words people might type, who can see it]
// who: 'all', or a list of 'visitor' (not logged in), 'guest', 'handler', 'admin'
const PAGES = [
  ['index.html', 'Home', 'main page start welcome status today cats staff open', 'all'],
  ['aboutus.html', 'About Us', 'about us our story cafe mission team who we are socials follow', 'all'],
  ['menu.html', 'Menu', 'food drinks snacks allergy allergies allergens order coffee', 'all'],
  ['cats.html', 'Meet our cats', 'cats photos reviews rating stars', 'all'],
  ['rate.html', 'Rates', 'price prices per hour cost charge refund pay', 'all'],
  ['hours.html', 'Opening hours', 'open hours public holiday holidays schedule lunch closed', 'all'],
  ['events.html', 'Events', 'event events offers special guest', 'all'],
  ['faq.html', 'FAQ', 'questions answers help feedback contact ask', 'all'],
  ['rules.html', 'Cafe rules', 'rules cats safety children behaviour', 'all'],
  ['terms.html', 'Terms and conditions', 'terms conditions legal privacy copyright', 'all'],
  ['support.html', 'Support us', 'subscribe subscription donate membership supporter', 'all'],
  ['sessions.html', 'Sessions', 'booking code check my bookings cancel pay review', ['visitor', 'guest']],
  ['booking.html', 'Book a Session', 'book reserve reservation hours time cats room', ['visitor', 'guest']],
  ['settings.html', 'Settings', 'settings account profile avatar icon password payment method history subscription fee', ['guest', 'handler', 'admin']],
  ['session-orders.html', 'Session orders', 'orders sessions rooms food drinks serve customers', ['handler']],
  ['login.html', 'Login', 'log in sign in password', ['visitor']],
  ['signup.html', 'Sign up', 'register account create guest', ['visitor']],
  ['forgot.html', 'Forgot password', 'reset password code', ['visitor']],
  ['handler.html', 'My Sessions', 'sessions check in conclude leave sick cats cat status reviews', ['handler']],
  ['cat-schedule.html', 'Cat schedule', 'cats booked break free resting timeline', ['handler', 'admin']],
  ['admin.html', 'Reservations', 'bookings reservations edit cancel handlers refund', ['admin']],
  ['admin-orders.html', 'Orders', 'food orders served drinks', ['admin']],
  ['admin-menu.html', 'Manage Menu', 'menu items allergens descriptions photos prices', ['admin']],
  ['admin-rooms.html', 'Manage Rooms', 'rooms capacity hours private lounge', ['admin']],
  ['admin-sessions.html', 'Manage Sessions', 'sessions hours cats maximum minimum', ['admin']],
  ['admin-rates.html', 'Manage Rates', 'rates price per hour weekend holiday charge', ['admin']],
  ['admin-hours.html', 'Hours and holidays', 'opening hours public holiday lunch break closed', ['admin']],
  ['admin-cats.html', 'Manage Cats', 'cats sick unwell handler photo resting', ['admin']],
  ['admin-staff.html', 'Staff and leave', 'staff handlers leave sick urgent break', ['admin']],
  ['admin-reviews.html', 'Reviews', 'ratings reviews stars cats staff', ['admin']],
  ['admin-faq.html', 'FAQ and feedback', 'faq feedback questions supporters subscribers', ['admin']],
  ['admin-events.html', 'Manage Events', 'events offers', ['admin']]
];

function roleOf(user) { return user ? user.role : 'visitor'; }
function canSee(page, role) { return page[3] === 'all' || page[3].includes(role); }

// The side menu: which screens each kind of user sees, in order.
function menuFor(user) {
  const role = roleOf(user);
  const byFile = file => PAGES.find(p => p[0] === file);
  const pick = files => files.map(f => f === 'DASHBOARD' ? [dashboardUrl(), 'Dashboard'] : [f, byFile(f)[1]]);
  if (role === 'visitor') return pick(['index.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'sessions.html', 'events.html', 'aboutus.html', 'faq.html', 'support.html']);
  if (role === 'guest') return pick(['index.html', 'booking.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'sessions.html', 'events.html', 'aboutus.html', 'faq.html', 'support.html', 'settings.html']);
  if (role === 'handler') return pick(['handler.html', 'session-orders.html', 'DASHBOARD', 'cat-schedule.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'events.html', 'aboutus.html', 'faq.html']);
  return pick(['DASHBOARD', 'admin.html', 'admin-orders.html', 'admin-menu.html', 'admin-rooms.html', 'admin-sessions.html', 'admin-rates.html',
               'admin-hours.html', 'admin-cats.html', 'admin-staff.html', 'cat-schedule.html', 'admin-reviews.html', 'admin-faq.html', 'admin-events.html']);
}

// Screens that match what was typed (every word must appear in the title or the keywords)
function searchPages(query, user) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const role = roleOf(user);
  const pool = PAGES.filter(p => canSee(p, role) && !((role === 'handler' || role === 'admin') && p[0] === 'index.html')).map(p => [p[0], p[1], (p[1] + ' ' + p[2]).toLowerCase()]);
  if (role === 'handler' || role === 'admin') pool.push([dashboardUrl(), 'Dashboard', 'dashboard charts reports overview']);
  return pool.filter(p => words.every(w => p[2].includes(w)))
             .sort((a, b) => (b[1].toLowerCase().startsWith(words[0]) ? 1 : 0) - (a[1].toLowerCase().startsWith(words[0]) ? 1 : 0))
             .slice(0, 8);
}

// A computer screen is 1024 pixels wide or more. Tablets and phones are narrower.
const DESKTOP_QUERY = '(min-width: 1024px)';
function isDesktop() {
  if (window.matchMedia) return window.matchMedia(DESKTOP_QUERY).matches;
  return window.innerWidth >= 1024;
}

// Two kinds of menu, chosen by who is looking:
//  - 'top'  (visitors and guests): hidden when the page loads. The three-line button drops a panel down
//           from under the top bar, OVER the page (the page never moves). Click the button, click outside,
//           pick a page or press Esc to close it.
//  - 'side' (staff and admin): a fixed sidebar on the left that is always there on a computer, because they
//           keep jumping between editing screens. On a tablet or phone it is a slide-in drawer instead.
function menuMode(user) {
  const role = roleOf(user);
  return role === 'handler' || role === 'admin' ? 'side' : 'top';
}

function setupMenuToggle(mode) {
  const nav = document.getElementById('side-nav');
  const button = document.getElementById('menuToggle');
  const overlay = document.getElementById('navOverlay');
  document.body.classList.toggle('nav-top', mode === 'top');
  document.body.classList.toggle('nav-side', mode === 'side');

  function permanent() { return mode === 'side' && isDesktop(); }      // the staff sidebar on a computer never hides

  function setOpen(open) {
    if (permanent()) open = true;
    nav.classList.toggle('open', open);
    button.classList.toggle('active', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    overlay.classList.toggle('show', open && !permanent());           // a see-through click-away layer (dark on a phone drawer)
    overlay.classList.toggle('dim', open && mode === 'side' && !permanent());
  }

  button.addEventListener('click', function () { if (!permanent()) setOpen(!nav.classList.contains('open')); });
  overlay.addEventListener('click', function () { setOpen(false); });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A' && !permanent()) setOpen(false);     // close after choosing a page
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !permanent()) setOpen(false);
  });

  setOpen(permanent());                                               // staff on a computer: open. Everyone else: closed.
  if (window.matchMedia) {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = function () { setOpen(permanent()); };           // reset when the window is resized
    if (query.addEventListener) query.addEventListener('change', onChange);
    else if (query.addListener) query.addListener(onChange);
  }
}

// The search box at the top of the menu: type a word, get the screens that match
function setupSearch(user) {
  const input = document.getElementById('navSearch');
  const results = document.getElementById('navResults');
  const links = document.getElementById('navLinks');
  if (!input) return;                                            // visitors and guests search from the home page instead

  function update() {
    const query = input.value.trim();
    results.innerHTML = '';
    links.style.display = query ? 'none' : 'contents';
    if (!query) return;
    const found = searchPages(query, user);
    if (found.length === 0) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'No screen found for "' + query + '".';
      results.appendChild(none);
      return;
    }
    found.forEach(function (p) {
      const a = document.createElement('a');
      a.href = p[0];
      a.textContent = p[1];
      results.appendChild(a);
    });
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {                                     // Enter opens the first match
      e.preventDefault();
      const first = results.querySelector('a');
      if (first) window.location.href = first.getAttribute('href');
    } else if (e.key === 'Escape') {
      input.value = '';
      update();
    }
  });
}

// The big search bar on the home page (over the cat): type a word, pick a screen. Enter opens the first match.
function setupHeroSearch(user) {
  const form = document.getElementById('heroSearchForm');
  if (!form) return;
  const input = document.getElementById('heroSearch');
  const results = document.getElementById('heroResults');

  function update() {
    const query = input.value.trim();
    results.innerHTML = '';
    if (!query) return;
    const found = searchPages(query, user);
    if (found.length === 0) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'No screen found for "' + query + '".';
      results.appendChild(none);
      return;
    }
    found.forEach(function (p) {
      const a = document.createElement('a');
      a.href = p[0];
      a.textContent = p[1];
      results.appendChild(a);
    });
  }
  input.addEventListener('input', update);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const first = results.querySelector('a');
    if (first) window.location.href = first.getAttribute('href');
    else update();
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.value = ''; update(); }
  });
}

// ----- the round avatar that replaces "Logged in as <name>" -----
function avatarElement(user, className) {
  const el = document.createElement('span');
  el.className = 'avatar-circle' + (className ? ' ' + className : '');
  const a = user.avatar || {};
  el.style.background = a.color || '#c98672';
  const icon = AVATAR_ICONS[a.icon];
  if (icon) el.textContent = icon;
  else el.textContent = (String(user.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();   // initials until an icon is chosen
  return el;
}

function setupAvatarMenu() {
  const button = document.getElementById('avatarBtn');
  const menu = document.getElementById('avatarMenu');
  if (!button) return;
  function setOpen(open) { menu.hidden = !open; button.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  button.addEventListener('click', function (e) { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener('click', function (e) { if (!menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  document.getElementById('logoutLink').addEventListener('click', function (e) { e.preventDefault(); logout(); });
}

// ----- the search box in the top bar (visitors and guests; the staff have theirs in the side menu) -----
// The results list scrolls inside its own box, so a long list is never cut off by the bottom of the screen.
function setupHeaderSearch(user) {
  const wrap = document.getElementById('headerSearch');
  if (!wrap) return;
  const input = document.getElementById('headerSearchInput');
  const results = document.getElementById('headerResults');
  const toggle = document.getElementById('headerSearchToggle');

  function update() {
    const query = input.value.trim();
    results.innerHTML = '';
    results.hidden = !query;
    if (!query) return;
    const found = searchPages(query, user);
    if (found.length === 0) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'No screen found for "' + query + '".';
      results.appendChild(none);
      return;
    }
    found.forEach(function (p) {
      const a = document.createElement('a');
      a.href = p[0];
      a.textContent = p[1];
      results.appendChild(a);
    });
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = results.querySelector('a');
      if (first) window.location.href = first.getAttribute('href');
    } else if (e.key === 'Escape') {
      input.value = '';
      update();
      wrap.classList.remove('open');
    }
  });
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target) && e.target !== toggle) { results.hidden = true; } });
  input.addEventListener('focus', update);
  toggle.addEventListener('click', function (e) {                       // on a phone the search opens under the top bar
    e.stopPropagation();
    wrap.classList.toggle('open');
    if (wrap.classList.contains('open')) input.focus();
  });
}

function renderLayout(activePage) {
  const user = currentUser();
  const staffUser = !!user && (user.role === 'handler' || user.role === 'admin');
  const searchBox = !staffUser
    ? '<div class="header-search" id="headerSearch"><input type="search" id="headerSearchInput" placeholder="Search the website..." aria-label="Search the website" autocomplete="off">' +
      '<div class="header-results" id="headerResults" hidden></div></div>' +
      '<button type="button" class="header-search-toggle" id="headerSearchToggle" aria-label="Search">\u{1F50D}</button>'
    : '';

  // Header: menu button and title on the left, search in the middle, login / sign up (or the avatar) on the right
  const header = document.getElementById('site-header');
  header.innerHTML =
    '<button type="button" class="menu-toggle" id="menuToggle" aria-label="Open or close the menu" aria-controls="side-nav" aria-expanded="false">' +
    '<span></span><span></span><span></span></button>' +
    '<div class="brand"><a href="' + (staffUser ? homePageFor(user.role) : 'index.html') + '">PURRSONA MEOW</a></div>' +
    searchBox +
    '<div class="header-right" id="headerRight"></div>';
  const right = document.getElementById('headerRight');

  if (user) {
    const wrap = document.createElement('div');
    wrap.className = 'avatar-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'avatarBtn';
    button.className = 'avatar-btn';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Account menu for ' + user.name);
    button.title = user.name;
    button.appendChild(avatarElement(user));
    const menu = document.createElement('div');
    menu.id = 'avatarMenu';
    menu.className = 'avatar-menu';
    menu.hidden = true;
    const head = document.createElement('div');
    head.className = 'avatar-head';
    const strong = document.createElement('strong');
    strong.textContent = user.name;
    const small = document.createElement('small');
    small.textContent = user.role === 'handler' ? 'Cat handler' : user.role === 'admin' ? 'Admin' : 'Guest';
    head.append(strong, small);
    menu.appendChild(head);
    menu.insertAdjacentHTML('beforeend', '<a href="settings.html">Settings</a><a href="#" id="logoutLink">Log out</a>');
    wrap.append(button, menu);
    right.appendChild(wrap);
  } else {
    right.innerHTML = '<a class="btn" href="login.html">Login</a><a class="btn" href="signup.html">Sign up</a>';
  }

  // Menu: a search box, then the links
  const nav = document.getElementById('side-nav');
  nav.setAttribute('aria-label', 'Main menu');
  const staffMenu = menuMode(user) === 'side';
  nav.innerHTML =
    (staffMenu ? '<div class="nav-search"><input type="search" id="navSearch" placeholder="Search screens..." aria-label="Search screens" autocomplete="off"></div>' +
                 '<div class="nav-results" id="navResults"></div>' : '') +
    '<div class="nav-links" id="navLinks">' +
    menuFor(user).map(p => '<a href="' + p[0] + '"' + (p[0] === activePage ? ' class="active"' : '') + '>' + p[1] + '</a>').join('') +
    '</div>';

  // Dark backdrop behind the menu on tablet and phone
  if (!document.getElementById('navOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'navOverlay';
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);
  }

  // Footer: copyright and the pages people look for
  document.getElementById('site-footer').innerHTML =
    '<p class="footer-links"><a href="terms.html">Terms and conditions</a><a href="rules.html">Cafe rules</a><a href="aboutus.html">About Us</a><a href="faq.html">FAQ</a>' +
    '<a href="hours.html">Opening hours</a><a href="support.html">Support us</a></p>' +
    '<p>\u00a9 ' + new Date().getFullYear() + ' Cat Caf\u00e9 Reservations. All rights reserved. &nbsp;|&nbsp; Practice project &nbsp;|&nbsp; Contact: hello@example.com</p>';

  setupMenuToggle(menuMode(user));
  setupSearch(user);
  setupHeroSearch(user);
  setupHeaderSearch(user);
  setupAvatarMenu();
  if (typeof addPasswordToggles === 'function') addPasswordToggles();
}
