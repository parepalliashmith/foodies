// Foodies — app logic. Menu data comes from menu-data.js (CATEGORIES).

const NONVEG_WORDS = /\b(chicken|eggs?|mutton|fish|prawn|kabab|kfc|wings?|lollipop)\b/i;
function isNonVeg(name) { return NONVEG_WORDS.test(name); }

// Flatten CATEGORIES into a searchable item list with stable ids.
const ITEMS = [];
CATEGORIES.forEach(cat => {
  cat.subcats.forEach(sub => {
    sub.items.forEach(([name, price], i) => {
      ITEMS.push({
        id: `${cat.key}__${sub.name}__${i}__${name}`.replace(/\s+/g, '_'),
        name, price, cat: cat.key, catName: cat.name, sub: sub.name,
        veg: !isNonVeg(name),
      });
    });
  });
});

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = n => `₹${n}`;

// ---------- State ----------
let cart = JSON.parse(localStorage.getItem('fd_cart') || '{}'); // id -> qty
let orders = JSON.parse(localStorage.getItem('fd_orders') || '[]');
let activeCat = null;
let vegOnly = false;
let searchQuery = '';

function saveCart() { localStorage.setItem('fd_cart', JSON.stringify(cart)); }
function saveOrders() { localStorage.setItem('fd_orders', JSON.stringify(orders)); }

function cartCount() { return Object.values(cart).reduce((a, b) => a + b, 0); }
function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = ITEMS.find(i => i.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);
}

// ---------- Rendering: category grid ----------
function renderCategories() {
  const grid = $('#categoryGrid');
  grid.innerHTML = CATEGORIES.map(cat => {
    const count = cat.subcats.reduce((n, s) => n + s.items.length, 0);
    return `<button class="cat-card" data-cat="${cat.key}" style="background-image:linear-gradient(180deg, rgba(10,6,6,0.35), rgba(10,6,6,0.92)), url('images/${cat.key}.jpg')">
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-name">${cat.name}</span>
      <span class="cat-count">${count} items</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.cat-card').forEach(btn => {
    btn.addEventListener('click', () => openCategory(btn.dataset.cat));
  });
}

function openCategory(key) {
  activeCat = key;
  $('#homeView').classList.add('hidden');
  $('#categoryView').classList.remove('hidden');
  $('#searchView').classList.add('hidden');
  const cat = CATEGORIES.find(c => c.key === key);
  $('#categoryTitle').textContent = `${cat.icon} ${cat.name}`;
  $('#categoryHero').style.backgroundImage = `linear-gradient(180deg, rgba(10,6,6,0.15), rgba(10,6,6,0.95)), url('images/${cat.key}.jpg')`;
  renderCategoryItems();
}

function renderCategoryItems() {
  const cat = CATEGORIES.find(c => c.key === activeCat);
  const body = $('#categoryBody');
  if (!cat.subcats.some(s => s.items.length)) {
    body.innerHTML = `<p class="empty-note">Coming soon — ask staff for availability.</p>`;
    return;
  }
  body.innerHTML = cat.subcats.map(sub => {
    const items = sub.items.filter(([name]) => !vegOnly || !isNonVeg(name));
    if (!items.length) return '';
    return `<h3 class="subcat-title">${sub.name}</h3>
      <div class="item-list">
        ${items.map(([name, price], i) => itemRow(findItem(cat.key, sub.name, i, name))).join('')}
      </div>`;
  }).join('');
  wireItemRows(body);
}

function findItem(catKey, subName, i, name) {
  return ITEMS.find(it => it.cat === catKey && it.sub === subName && it.name === name) ||
    ITEMS.find(it => it.cat === catKey && it.sub === subName)[i];
}

function itemRow(item) {
  const qty = cart[item.id] || 0;
  return `<div class="item-row" data-id="${item.id}">
    <span class="veg-dot ${item.veg ? 'veg' : 'nonveg'}" title="${item.veg ? 'Veg' : 'Non-Veg'}"></span>
    <div class="item-info">
      <div class="item-name">${item.name}</div>
      <div class="item-price">${item.price ? fmt(item.price) : 'Free'}</div>
    </div>
    <div class="item-qty">
      ${qty === 0
        ? `<button class="btn-add" data-action="add">ADD</button>`
        : `<div class="qty-stepper">
             <button data-action="dec">−</button>
             <span>${qty}</span>
             <button data-action="inc">+</button>
           </div>`}
    </div>
  </div>`;
}

function wireItemRows(container) {
  container.querySelectorAll('.item-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'add' || action === 'inc') cart[id] = (cart[id] || 0) + 1;
        if (action === 'dec') { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
        saveCart();
        row.outerHTML = itemRow(ITEMS.find(i => i.id === id));
        wireItemRows(container);
        updateCartBar();
      });
    });
  });
}

// ---------- Search ----------
function renderSearch(query) {
  searchQuery = query;
  $('#homeView').classList.add('hidden');
  $('#categoryView').classList.add('hidden');
  $('#searchView').classList.remove('hidden');
  const q = query.trim().toLowerCase();
  const results = q ? ITEMS.filter(i => i.name.toLowerCase().includes(q) && (!vegOnly || i.veg)) : [];
  const body = $('#searchBody');
  if (!q) { body.innerHTML = `<p class="empty-note">Start typing to search the full menu.</p>`; return; }
  if (!results.length) { body.innerHTML = `<p class="empty-note">No dishes found for "${query}".</p>`; return; }
  body.innerHTML = `<div class="item-list">${results.map(itemRow).join('')}</div>`;
  wireItemRows(body);
}

function goHome() {
  $('#homeView').classList.remove('hidden');
  $('#categoryView').classList.add('hidden');
  $('#searchView').classList.add('hidden');
  $('#searchInput').value = '';
  activeCat = null;
}

// ---------- Cart bar / drawer ----------
function updateCartBar() {
  const bar = $('#cartBar');
  const count = cartCount();
  if (count === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  $('#cartBarCount').textContent = `${count} item${count > 1 ? 's' : ''}`;
  $('#cartBarTotal').textContent = fmt(cartTotal());
}

function renderCartDrawer() {
  const body = $('#cartDrawerBody');
  const entries = Object.entries(cart);
  if (!entries.length) {
    body.innerHTML = `<p class="empty-note">Your cart is empty.</p>`;
    $('#cartDrawerFooter').classList.add('hidden');
    return;
  }
  body.innerHTML = entries.map(([id, qty]) => {
    const item = ITEMS.find(i => i.id === id);
    if (!item) return '';
    return `<div class="cart-line" data-id="${id}">
      <div class="cart-line-info">
        <span class="veg-dot ${item.veg ? 'veg' : 'nonveg'}"></span>
        <span>${item.name}</span>
      </div>
      <div class="qty-stepper">
        <button data-action="dec">−</button><span>${qty}</span><button data-action="inc">+</button>
      </div>
      <span class="cart-line-price">${fmt(item.price * qty)}</span>
    </div>`;
  }).join('');
  body.querySelectorAll('.cart-line').forEach(row => {
    const id = row.dataset.id;
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'inc') cart[id] = (cart[id] || 0) + 1;
        if (action === 'dec') { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
        saveCart();
        renderCartDrawer();
        updateCartBar();
        if (activeCat) renderCategoryItems();
        if (!$('#searchView').classList.contains('hidden')) renderSearch(searchQuery);
      });
    });
  });
  $('#cartDrawerFooter').classList.remove('hidden');
  const subtotal = cartTotal();
  const delivery = subtotal > 0 ? 30 : 0;
  const total = subtotal + delivery;
  $('#cartSubtotal').textContent = fmt(subtotal);
  $('#cartDelivery').textContent = fmt(delivery);
  $('#cartTotal').textContent = fmt(total);
}

function openCartDrawer() { renderCartDrawer(); $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('show'); }
function closeCartDrawer() { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('show'); }

// ---------- Checkout ----------
function openCheckout() {
  if (!cartCount()) return;
  closeCartDrawer();
  $('#checkoutModal').classList.add('show');
  $('#overlay').classList.add('show');
  const subtotal = cartTotal();
  const delivery = 30;
  $('#coSubtotal').textContent = fmt(subtotal);
  $('#coDelivery').textContent = fmt(delivery);
  $('#coTotal').textContent = fmt(subtotal + delivery);
  const saved = JSON.parse(localStorage.getItem('fd_customer') || '{}');
  $('#coName').value = saved.name || '';
  $('#coPhone').value = saved.phone || '';
  $('#coAddress').value = saved.address || '';
}
function closeCheckout() { $('#checkoutModal').classList.remove('show'); $('#overlay').classList.remove('show'); }

function placeOrder(e) {
  e.preventDefault();
  const name = $('#coName').value.trim();
  const phone = $('#coPhone').value.trim();
  const address = $('#coAddress').value.trim();
  const payment = $('input[name="payment"]:checked').value;
  if (!name || !/^\d{10}$/.test(phone) || !address) {
    alert('Please fill name, a valid 10-digit phone, and address.');
    return;
  }
  localStorage.setItem('fd_customer', JSON.stringify({ name, phone, address }));

  const lines = Object.entries(cart).map(([id, qty]) => {
    const item = ITEMS.find(i => i.id === id);
    return { name: item.name, price: item.price, qty };
  });
  const subtotal = cartTotal();
  const delivery = 30;
  const order = {
    id: 'FD' + Date.now().toString().slice(-8),
    time: new Date().toISOString(),
    name, phone, address, payment,
    lines, subtotal, delivery, total: subtotal + delivery,
    status: 'Placed',
  };
  orders.unshift(order);
  saveOrders();
  cart = {};
  saveCart();
  updateCartBar();
  closeCheckout();
  showOrderConfirmed(order);
}

function showOrderConfirmed(order) {
  $('#confirmOrderId').textContent = order.id;
  $('#confirmModal').classList.add('show');
  $('#overlay').classList.add('show');
}
function closeConfirm() { $('#confirmModal').classList.remove('show'); $('#overlay').classList.remove('show'); goToOrders(); }

// ---------- Orders / tracking ----------
const STATUS_STEPS = ['Placed', 'Preparing', 'Ready', 'Completed'];

function goToOrders() {
  $('#homeView').classList.add('hidden');
  $('#categoryView').classList.add('hidden');
  $('#searchView').classList.add('hidden');
  $('#ordersView').classList.remove('hidden');
  renderOrders();
}

function renderOrders() {
  const body = $('#ordersBody');
  if (!orders.length) { body.innerHTML = `<p class="empty-note">No orders yet. Go place one!</p>`; return; }
  body.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-card-head">
        <span>#${o.id}</span>
        <span class="order-status status-${o.status.toLowerCase()}">${o.status}</span>
      </div>
      <div class="order-progress">
        ${STATUS_STEPS.map(s => `<span class="step ${STATUS_STEPS.indexOf(o.status) >= STATUS_STEPS.indexOf(s) ? 'done' : ''}">${s}</span>`).join('')}
      </div>
      <div class="order-lines">
        ${o.lines.map(l => `<div class="order-line"><span>${l.qty}× ${l.name}</span><span>${fmt(l.price * l.qty)}</span></div>`).join('')}
      </div>
      <div class="order-total">Total: ${fmt(o.total)} · ${o.payment.toUpperCase()}</div>
      ${o.status !== 'Completed' ? `<button class="btn-advance" data-id="${o.id}">Staff: Advance Status →</button>` : ''}
    </div>
  `).join('');
  body.querySelectorAll('.btn-advance').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      const idx = STATUS_STEPS.indexOf(order.status);
      order.status = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 1)];
      saveOrders();
      renderOrders();
    });
  });
}

// ---------- Wire up ----------
document.addEventListener('DOMContentLoaded', () => {
  renderCategories();
  updateCartBar();

  $('#backToHome').addEventListener('click', goHome);
  $('#logoHome').addEventListener('click', goHome);
  $('#searchInput').addEventListener('input', e => renderSearch(e.target.value));
  $('#vegToggle').addEventListener('change', e => {
    vegOnly = e.target.checked;
    if (activeCat) renderCategoryItems();
    if (!$('#searchView').classList.contains('hidden')) renderSearch(searchQuery);
  });

  $('#tagBar').querySelectorAll('span[data-cat]').forEach(tag => {
    tag.addEventListener('click', () => openCategory(tag.dataset.cat));
  });

  $('#cartBar').addEventListener('click', openCartDrawer);
  $('#cartClose').addEventListener('click', closeCartDrawer);
  $('#checkoutBtn').addEventListener('click', openCheckout);
  $('#checkoutClose').addEventListener('click', closeCheckout);
  $('#checkoutForm').addEventListener('submit', placeOrder);
  $('#confirmClose').addEventListener('click', closeConfirm);
  $('#ordersNav').addEventListener('click', goToOrders);
  $('#overlay').addEventListener('click', () => { closeCartDrawer(); closeCheckout(); });
});
