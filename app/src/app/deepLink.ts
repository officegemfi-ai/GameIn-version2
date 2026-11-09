// A static host answers an unknown path (a deep link like /deals/123 opened fresh) with its 404 page, which sends the
// browser to the app as ?redirect=/deals/123 (app/deploy/404.html). This puts the real path back. main.tsx imports it
// first, so it runs before the router is created and reads the address.
const params = new URLSearchParams(window.location.search);
const to = params.get('redirect');
if (to && to.startsWith('/') && !to.startsWith('//')) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  window.history.replaceState(null, '', base + to);
}

export {};
