// Needs auth.js loaded first (for currentUser and logout).
// Draws the header, the fixed side menu (with a search box for screens), and the footer on every page.

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
  ['dashboard.html', 'Dashboard', 'dashboard charts reports overview numbers bookings revenue', ['handler', 'admin']],
  ['staff-status.html', 'Staff status', 'staff status working on leave home clock in break lunch off who is in take leave sick urgent', ['handler', 'admin']],
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

// Small line icons for the staff sidebar (24x24, drawn with a stroke so they take the text colour)
const NAV_ICONS = {
  'handler.html': '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  'session-orders.html': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'dashboard.html': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  'cat-schedule.html': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'staff-status.html': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  'faq.html': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  'admin.html': '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'admin-orders.html': '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
  'admin-menu.html': '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  'admin-rooms.html': '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/>',
  'admin-sessions.html': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'admin-rates.html': '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  'admin-hours.html': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l-3 3"/><path d="M2 12h2M20 12h2"/>',
  'admin-cats.html': '<path d="M12 21c-4 0-7-2.5-7-6 0-2 1-3.5 2-4.5L5 5l4 2c1-.3 2-.5 3-.5s2 .2 3 .5l4-2-2 5.500c1 1 2 2.500 2 4.500 0 3.500-3 6-7 6z"/><path d="M9 13h.01M15 13h.01"/>',
  'admin-staff.html': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  'admin-reviews.html': '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.200 6.800L12 17.700 5.800 21l1.200-6.800-5-4.900 6.900-1z"/>',
  'admin-faq.html': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'admin-events.html': '<path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.500a2.500 2.500 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.500a2.500 2.500 0 0 0 0-5C13 2 12 7 12 7z"/>',
  'settings.html': '<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/>'
};
function navIcon(file) {
  const path = NAV_ICONS[file];
  if (!path) return '';
  return '<svg class="nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
}

// The side menu: which screens each kind of user sees, in order, in labelled groups: [{ label, items: [[file, title]] }]
// Visitors and guests have one unlabelled group. The staff and admin sidebar uses the labels.
function menuGroups(user) {
  const role = roleOf(user);
  const byFile = file => PAGES.find(p => p[0] === file);
  const pick = files => files.map(f => [f, byFile(f)[1]]);
  const one = files => [{ label: '', items: pick(files) }];
  if (role === 'visitor') return one(['index.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'sessions.html', 'events.html', 'aboutus.html', 'faq.html', 'support.html']);
  if (role === 'guest') return one(['index.html', 'booking.html', 'menu.html', 'cats.html', 'rate.html', 'hours.html', 'sessions.html', 'events.html', 'aboutus.html', 'faq.html', 'support.html', 'settings.html']);
  if (role === 'handler') {
    return [
      { label: 'My work', items: pick(['handler.html', 'session-orders.html']) },
      { label: 'Overview', items: pick(['dashboard.html', 'cat-schedule.html', 'staff-status.html']) },
      { label: 'Help', items: pick(['faq.html']) }
    ];
  }
  return [
    { label: 'Overview', items: pick(['dashboard.html', 'admin.html', 'admin-orders.html', 'cat-schedule.html']) },
    { label: 'Cafe setup', items: pick(['admin-menu.html', 'admin-rooms.html', 'admin-sessions.html', 'admin-rates.html', 'admin-hours.html', 'admin-cats.html', 'admin-events.html']) },
    { label: 'People', items: pick(['staff-status.html', 'admin-staff.html', 'admin-reviews.html', 'admin-faq.html']) }
  ];
}
function menuFor(user) {
  return [].concat.apply([], menuGroups(user).map(g => g.items));
}

// Screens that match what was typed (every word must appear in the title or the keywords)
function searchPages(query, user) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const role = roleOf(user);
  const pool = PAGES.filter(p => canSee(p, role) && !((role === 'handler' || role === 'admin') && p[0] === 'index.html')).map(p => [p[0], p[1], (p[1] + ' ' + p[2]).toLowerCase()]);
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
  const searchBox = true
    ? '<div class="header-search" id="headerSearch"><input type="search" id="headerSearchInput" placeholder="' + (staffUser ? 'Search screens...' : 'Search the website...') + '" aria-label="Search the website" autocomplete="off">' +
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

  // Menu: for visitors and guests a plain list; for staff and admin a proper sidebar
  // (profile card, labelled groups with icons). Their search box lives in the top bar.
  const nav = document.getElementById('side-nav');
  nav.setAttribute('aria-label', 'Main menu');
  const staffMenu = menuMode(user) === 'side';
  const link = (p, withIcon) => '<a href="' + p[0] + '"' + (p[0] === activePage ? ' class="active" aria-current="page"' : '') + '>' +
    (withIcon ? navIcon(p[0]) : '') + '<span>' + p[1] + '</span></a>';
  if (staffMenu) {
    const roleName = user.role === 'admin' ? 'Admin' : 'Cat handler';
    nav.innerHTML =
      '<div class="side-profile"><span id="sideAvatar"></span><div><strong></strong><small>' + roleName + '</small></div></div>' +
      '<div class="nav-links" id="navLinks">' +
      menuGroups(user).map(g => '<div class="nav-group"><div class="nav-label">' + g.label + '</div>' + g.items.map(p => link(p, true)).join('') + '</div>').join('') +
      '</div>' +
      '<div class="nav-foot"><a href="settings.html"' + (activePage === 'settings.html' ? ' class="active"' : '') + '>' + navIcon('settings.html') + '<span>Settings</span></a></div>';
    nav.querySelector('.side-profile strong').textContent = user.name;
    document.getElementById('sideAvatar').replaceWith(avatarElement(user, 'side-avatar'));
  } else {
    nav.innerHTML = '<div class="nav-links" id="navLinks">' + menuFor(user).map(p => link(p, false)).join('') + '</div>';
  }

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
  setupHeroSearch(user);
  setupHeaderSearch(user);
  setupAvatarMenu();
  if (typeof addPasswordToggles === 'function') addPasswordToggles();
}

// ================================ pop-up messages that look like the rest of the site ================================
// uiAlert(message) / uiConfirm(message, options) / uiPrompt(message) return a promise. Use them with await.
// options: { title, okText, cancelText, danger }.
// (The browser's own grey pop-ups are not used any more. Tests set window.CATCAFE_NATIVE_DIALOGS to use stand-ins.)
function uiDialog(kind, message, options) {
  options = Object.assign({}, options || {});
  if (kind === 'confirm' && /^(Delete|Remove|Cancel|Clear)/i.test(String(message))) {          // questions that destroy something look serious
    const word = String(message).match(/^(Delete|Remove|Cancel|Clear)/i)[1];
    options.danger = options.danger !== undefined ? options.danger : true;
    options.okText = options.okText || (/cancel/i.test(word) ? 'Yes, cancel' : /clear/i.test(word) ? 'Yes, clear' : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    options.cancelText = options.cancelText || 'Keep it';
    options.title = options.title || (/cancel/i.test(word) ? 'Cancel?' : /clear/i.test(word) ? 'Clear?' : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + '?');
  }
  if (window.CATCAFE_NATIVE_DIALOGS) {
    if (kind === 'alert') { window.alert(message); return Promise.resolve(); }
    if (kind === 'confirm') return Promise.resolve(window.confirm(message));
    return Promise.resolve(window.prompt(message));
  }
  return new Promise(function (resolve) {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'ui-overlay';
    const box = document.createElement('div');
    box.className = 'ui-dialog' + (options.danger ? ' danger' : '');
    box.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = document.createElement('h2');
    title.textContent = options.title || (kind === 'confirm' ? 'Please confirm' : kind === 'prompt' ? 'Your answer' : 'Purrsona Meow');
    title.id = 'uiDialogTitle';
    box.setAttribute('aria-labelledby', 'uiDialogTitle');
    box.appendChild(title);
    String(message).split('\n').filter(function (line, i, all) { return line.trim() !== '' || (i > 0 && i < all.length - 1); }).forEach(function (line) {
      const p = document.createElement('p');
      p.textContent = line;
      if (line.trim() === '') p.className = 'gap';
      box.appendChild(p);
    });
    let field = null;
    if (kind === 'prompt') {
      field = document.createElement('textarea');
      field.rows = 4;
      field.maxLength = 1000;
      box.appendChild(field);
    }
    const row = document.createElement('div');
    row.className = 'ui-buttons';
    function close(value) {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previous && previous.focus) { try { previous.focus(); } catch (e) { /* ignore */ } }
      resolve(value);
    }
    const cancelValue = kind === 'prompt' ? null : false;
    if (kind !== 'alert') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'ui-cancel';
      cancel.textContent = options.cancelText || 'Cancel';
      cancel.addEventListener('click', function () { close(cancelValue); });
      row.appendChild(cancel);
    }
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'ui-ok';
    ok.textContent = options.okText || (kind === 'confirm' ? 'Yes' : 'OK');
    ok.addEventListener('click', function () { close(kind === 'prompt' ? field.value : kind === 'confirm' ? true : undefined); });
    row.appendChild(ok);
    box.appendChild(row);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(kind === 'alert' ? undefined : cancelValue); }
      else if (e.key === 'Tab') {                                          // keep the keyboard inside the pop-up
        const items = Array.prototype.slice.call(box.querySelectorAll('button, textarea'));
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && kind === 'alert') close(undefined); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    (field || ok).focus();
  });
}
function uiAlert(message, options) { return uiDialog('alert', message, options); }
function uiConfirm(message, options) { return uiDialog('confirm', message, options); }
function uiPrompt(message, options) { return uiDialog('prompt', message, options); }
