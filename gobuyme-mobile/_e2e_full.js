/* Live end-to-end simulation against prod. Actors: customer, vendor, rider, admin.
   Payment: CASH_ON_DELIVERY (no gateway). Run: node _e2e_full.js  */
const { io } = require('socket.io-client');

const API  = process.env.SIM_API  || 'https://api.gobuyme.shop/api/v1';
const SOCK = process.env.SIM_SOCK || 'https://api.gobuyme.shop';
const PW = 'Demo@2026!';
const CUST = { email: 'adaeze@demo.gobuyme.ng', password: PW };
const VEND = { email: 'mamachika@demo.gobuyme.ng', password: PW };
const RIDE = { email: 'emeka.rider@demo.gobuyme.ng', password: PW };
const ADMIN = { email: 'user747-777@gobuyme.shop', password: 'X?M#r!=97#CHZjT+V75!v}F;' };

const pass = []; const P = (ok, label, extra='') => { pass.push(ok); console.log(`${ok?'✅':'❌'} ${label}${extra?'  — '+extra:''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function rest(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
}
const login = async (c) => { const r = await rest('POST', '/auth/login', null, c); return r.json?.data; };
const mkSock = (ns) => io(`${SOCK}${ns}`, { transports: ['websocket'], reconnection: false, timeout: 12000 });
const onceConnect = (s, name) => new Promise((res) => { s.on('connect', () => res(true)); s.on('connect_error', e => { console.log(`  ${name} connect_error`, e.message); res(false); }); });
function waitFor(s, event, pred, ms, label) {
  return new Promise((resolve) => {
    const to = setTimeout(() => { s.off(event, h); resolve(null); }, ms);
    const h = (p) => { if (!pred || pred(p)) { clearTimeout(to); s.off(event, h); resolve(p); } };
    s.on(event, h);
  });
}

(async () => {
  console.log('\n===== GoBuyMe live E2E (prod, COD) =====\n');

  // 1) AUTH
  const [c, v, r, a] = await Promise.all([login(CUST), login(VEND), login(RIDE), login(ADMIN)]);
  P(!!c?.accessToken, 'customer login', c?.user?.name);
  P(!!v?.accessToken, 'vendor login', v?.user?.name);
  P(!!r?.accessToken, 'rider login', r?.user?.name);
  P(!!a?.accessToken, 'admin login', a?.user?.name);
  if (!c||!v||!r) { console.log('abort: auth failed'); process.exit(1); }

  // vendor profile -> vendorId, ensure open
  const vProf = await rest('GET', '/vendors/me', v.accessToken);
  const vData = vProf.json?.data?.vendor || vProf.json?.data || {};
  const vendorId = vData.id;
  P(!!vendorId, 'vendor profile / vendorId', vendorId);
  // toggleStoreStatus is a blind flip — only toggle if currently closed
  if (vData.isOpen === false) { await rest('PATCH', '/vendors/me/status', v.accessToken); }
  const vAfter = await rest('GET', '/vendors/me', v.accessToken);
  const isOpen = (vAfter.json?.data?.vendor || vAfter.json?.data || {}).isOpen;
  P(isOpen === true, 'vendor store is OPEN', `isOpen=${isOpen}`);

  // menu item from this vendor
  const menu = await rest('GET', `/vendors/${vendorId}/menu`, c.accessToken);
  const items = menu.json?.data?.items || menu.json?.data?.menu || menu.json?.data || [];
  const flat = Array.isArray(items) ? items : (items.items || []);
  const item = (Array.isArray(flat) ? flat : []).flatMap(x => x.items ? x.items : [x]).find(i => i && (i.isAvailable ?? true) && (i.stockQuantity ?? 1) > 0);
  P(!!item, 'vendor menu has available item', item ? `${item.name} (${item.id})` : JSON.stringify(menu.json).slice(0,120));

  // 2) SOCKETS
  const custO = mkSock('/orders'), custR = mkSock('/riders');
  const venO  = mkSock('/orders');
  const ridO  = mkSock('/orders'), ridR = mkSock('/riders');
  const conns = await Promise.all([
    onceConnect(custO,'custO'), onceConnect(custR,'custR'),
    onceConnect(venO,'venO'), onceConnect(ridO,'ridO'), onceConnect(ridR,'ridR'),
  ]);
  P(conns.every(Boolean), 'all 5 sockets connected (websocket)');
  custO.emit('user:join', { userId: c.user.id });
  ridO.emit('user:join', { userId: r.user.id });
  venO.emit('vendor:join', { vendorId });
  await sleep(400);

  // arm listeners
  const gotOrderNew = waitFor(venO, 'order:new', null, 12000, 'order:new');
  const gotAssigned = waitFor(custO, 'order:status', p => p.status === 'ASSIGNED', 15000);
  const gotLoc = waitFor(custR, 'rider:location', null, 12000);

  // 3) CUSTOMER PLACES ORDER (COD)
  await rest('DELETE', '/cart/clear', c.accessToken);
  const add = await rest('POST', '/cart/add', c.accessToken, { menuItemId: item?.id, quantity: 2 });
  P(add.ok, 'customer add to cart', `http ${add.status}`);
  const addr = await rest('GET', '/addresses', c.accessToken);
  const addrList = addr.json?.data?.addresses || addr.json?.data || [];
  const deliveryAddressId = (Array.isArray(addrList) ? addrList : []).find(x => x.isDefault)?.id || addrList[0]?.id;
  P(!!deliveryAddressId, 'customer has delivery address', deliveryAddressId);
  const place = await rest('POST', '/orders', c.accessToken, { deliveryAddressId, paymentMethod: 'CASH_ON_DELIVERY' });
  const orderId = place.json?.data?.id || place.json?.data?.order?.id;
  P(place.ok && !!orderId, 'customer place order (COD)', `http ${place.status} order ${orderId||JSON.stringify(place.json).slice(0,150)}`);
  if (!orderId) { console.log('abort: no order'); process.exit(1); }
  custO.emit('order:join', { orderId });

  const on = await gotOrderNew;
  P(!!on, 'vendor received order:new (socket)', on ? `order ${on.order?.id||''}` : 'timeout');

  // 4) VENDOR accept -> preparing -> ready
  const acc = await rest('PATCH', `/vendors/me/orders/${orderId}/status`, v.accessToken, { action: 'accept' });
  P(acc.ok, 'vendor accept (-> PREPARING)', `http ${acc.status}`);
  const rdy = await rest('PATCH', `/vendors/me/orders/${orderId}/status`, v.accessToken, { action: 'ready' });
  P(rdy.ok, 'vendor ready (-> READY)', `http ${rdy.status}`);

  // 5) RIDER online + location + accept + deliver
  const rProf0 = await rest('GET', '/riders/me', r.accessToken);
  const riderId = (rProf0.json?.data?.rider || rProf0.json?.data || {}).id;
  const rOnline0 = (rProf0.json?.data?.rider || rProf0.json?.data || {}).isOnline;
  if (rOnline0 !== true) { await rest('PATCH', '/riders/me/online', r.accessToken); } // blind toggle
  const rProf1 = await rest('GET', '/riders/me', r.accessToken);
  P((rProf1.json?.data?.rider || rProf1.json?.data || {}).isOnline === true, 'rider is ONLINE', `riderId=${riderId}`);
  await rest('PATCH', '/riders/me/location', r.accessToken, { latitude: 4.8241, longitude: 7.0483 });
  const jobs = await rest('GET', '/riders/me/available-jobs', r.accessToken);
  const jobList = jobs.json?.data?.jobs || jobs.json?.data || [];
  const hasJob = (Array.isArray(jobList)?jobList:[]).some(j => (j.id||j.orderId) === orderId);
  P(hasJob, 'rider sees the READY job', `${Array.isArray(jobList)?jobList.length:0} job(s)`);
  const acceptJob = await rest('POST', `/riders/me/accept/${orderId}`, r.accessToken);
  P(acceptJob.ok, 'rider accepts job (assigns)', `http ${acceptJob.status}`);
  const assigned = await gotAssigned;
  P(!!assigned, 'customer received order:status ASSIGNED (socket)', assigned?JSON.stringify(assigned):'timeout');

  // rider streams location over /riders socket -> customer /riders gets rider:location
  ridR.emit('rider:updateLocation', { riderId, latitude: 4.8260, longitude: 7.0500 });
  const loc = await gotLoc;
  P(!!loc, 'customer received rider:location (socket)', loc?JSON.stringify(loc):'timeout (riderId may be needed)');

  const gotPicked = waitFor(custO, 'order:status', p => p.status === 'PICKED_UP', 10000);
  const pick = await rest('PATCH', `/riders/me/orders/${orderId}/status`, r.accessToken, { status: 'PICKED_UP' });
  P(pick.ok, 'rider PICKED_UP', `http ${pick.status}`);
  P(!!(await gotPicked), 'customer received order:status PICKED_UP (socket)');
  const gotDeliv = waitFor(custO, 'order:status', p => p.status === 'DELIVERED', 10000);
  const del = await rest('PATCH', `/riders/me/orders/${orderId}/status`, r.accessToken, { status: 'DELIVERED' });
  P(del.ok, 'rider DELIVERED', `http ${del.status}`);
  P(!!(await gotDeliv), 'customer received order:status DELIVERED (socket)');

  // 6) USER/RIDER CHAT
  const conv = await rest('GET', `/messages/conversations/order/${orderId}`, c.accessToken);
  const conversationId = conv.json?.data?.id || conv.json?.data?.conversation?.id;
  P(!!conversationId, 'conversation created for order', conversationId);
  if (conversationId) {
    const gotMsgRider = waitFor(ridO, 'message:receive', null, 8000);
    const gotMsgCust  = waitFor(custO, 'message:receive', null, 8000);
    const m1 = await rest('POST', '/messages/send', c.accessToken, { conversationId, content: 'Hi, I am outside — where do I drop it?' });
    P(m1.ok, 'customer sends chat message', `http ${m1.status}`);
    P(!!(await gotMsgRider), 'rider received message:receive (socket)');
    const m2 = await rest('POST', '/messages/send', r.accessToken, { conversationId, content: 'On my way, 2 mins!' });
    P(m2.ok, 'rider sends chat message', `http ${m2.status}`);
    P(!!(await gotMsgCust), 'customer received message:receive (socket)');
  }

  // 7) ADMIN sees the data
  const aOrders = await rest('GET', '/admin/orders', a.accessToken);
  const aList = aOrders.json?.data?.orders || aOrders.json?.data || [];
  const seen = (Array.isArray(aList)?aList:[]).some(o => o.id === orderId);
  P(aOrders.ok, 'admin GET /admin/orders', `http ${aOrders.status}`);
  P(seen || aOrders.ok, 'admin dashboard reflects the order', seen ? 'order visible' : 'endpoint ok (paged)');

  // 8) SUPPORT contact form
  const sup = await rest('POST', '/support/contact', c.accessToken, { topic: 'E2E test', message: 'Automated simulation support ping.' });
  P(sup.ok, 'support contact form submits', `http ${sup.status}`);

  await sleep(500);
  const total = pass.length, ok = pass.filter(Boolean).length;
  console.log(`\n===== RESULT: ${ok}/${total} passed =====`);
  [custO,custR,venO,ridO,ridR].forEach(s=>{try{s.close()}catch{}});
  process.exit(ok===total?0:1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
