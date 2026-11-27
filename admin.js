'use strict';

// The publishable key is intended for browser use. Never put a service-role or secret key here.
const SUPABASE_URL = 'https://rizspsoqtfyedmfbvram.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ySrgm-yvh15E3AnXyEU9Ag_TjBHaHD1';
const IMAGE_BUCKET = 'cafe-images';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
let isPasswordRecovery = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
const BASE_TITLE = document.title;
let pollTimer = null;


const state = {
  user: null, admin: null, orders: [], todayOrders: [], orderItems: [],
  categories: [], subcategories: [], foods: [], deletedFoods: [], gallery: [], settings: null,
  reportOrders: [], themeSettings: {}, currentView: 'overview', stats: null, orderLimit: 150
};



const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—';
const statusOptions = ['received', 'accepted', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const DONE_STATUSES = ['completed', 'delivered'];   // both count as finished sales
const STATUS_LABELS = { out_for_delivery: 'Out for delivery', completed: 'Completed (pickup)', delivered: 'Delivered' };
function statusLabel(status) {
  const s = String(status || '');
  return STATUS_LABELS[s] || (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');
}
const themeDefaults = { name: 'forest', primary: '#142a20', background: '#142a20', surface: '#1d392b', text: '#f8efd9', muted: '#b9c4b8', accent: '#d8ad76' };
const themePresets = {
  forest: { name: 'forest', primary: '#142a20', background: '#142a20', surface: '#1d392b', text: '#f8efd9', muted: '#b9c4b8', accent: '#d8ad76' },
  dark: { name: 'dark', primary: '#171816', background: '#111310', surface: '#252722', text: '#f4f2ec', muted: '#b0b3a8', accent: '#d58b4b' },
  terracotta: { name: 'terracotta', primary: '#40251e', background: '#2d1a16', surface: '#55332a', text: '#fff1e6', muted: '#d8b9aa', accent: '#e6a56e' },
  ocean: { name: 'ocean', primary: '#163a49', background: '#102a34', surface: '#1e4c5c', text: '#e7f4f7', muted: '#a8c4cc', accent: '#e0a75b' }
};

function showMessage(message, isError = false) {
  const box = $('globalMessage');
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.classList.remove('hidden');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => box.classList.add('hidden'), 5500);
}
function setFormMessage(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#a53e35' : '#315d46';
}
function setBusy(button, busy, busyText = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}
function indiaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function indiaDayBounds(dateKey = indiaDateKey()) {
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}
function shiftDateKey(dateKey, offsetDays) {
  const base = new Date(`${dateKey}T12:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return indiaDateKey(base);
}
function currencySum(rows, predicate = () => true) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
}


/* Reads every page of a query (the server returns at most 1000 rows per request). */
async function fetchAll(build, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
function slugify(text) {
  return String(text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
}
function hexToRgb(hex) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '000000';
  return [0, 2, 4].map(i => parseInt(safe.slice(i, i + 2), 16));
}
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const x = relLuminance(a), y = relLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function themeProblems(t) {
  const block = [], warn = [];
  const check = (label, a, b, hard) => {
    const ratio = contrastRatio(a, b);
    if (ratio < 3) block.push(`${label} are too similar (${ratio.toFixed(1)}:1). Customers would not be able to read the website.`);
    else if (ratio < hard) warn.push(`${label} have low contrast (${ratio.toFixed(1)}:1). Aim for at least ${hard}:1.`);
  };
  check('Text and background colours', t.text, t.background, 4.5);
  check('Text and surface (card) colours', t.text, t.surface, 4.5);
  check('Text and main (header) colours', t.text, t.primary, 4.5);
  const muted = contrastRatio(t.muted, t.background);
  if (muted < 3) warn.push(`Muted text is hard to read on the background (${muted.toFixed(1)}:1).`);
  const accent = contrastRatio(t.accent, t.background);
  if (accent < 3) warn.push(`The accent colour is hard to see on the background (${accent.toFixed(1)}:1).`);
  return { block, warn };
}
function clearNewOrderAlert() { document.title = BASE_TITLE; }
function notifyNewOrder(count) {
  showMessage(`${count} new order${count > 1 ? 's' : ''} received.`);
  document.title = `(${state.stats?.received ?? count}) New order · ${BASE_TITLE}`;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.value = 0.08;
    osc.start(); osc.stop(ctx.currentTime + 0.25); setTimeout(() => ctx.close(), 500);
  } catch (e) { /* sound is optional */ }
}
async function quietRefresh() {
  if (!state.user || isPasswordRecovery) return;
  try {
    const before = state.stats?.received ?? 0;
    await Promise.all([loadOrders(), loadTodayOrders(), loadOverviewStats()]);
    renderOverview();
    if (state.currentView === 'orders' && !$('ordersList').contains(document.activeElement)) renderOrders();
    const gained = (state.stats?.received ?? 0) - before;
    if (gained > 0) notifyNewOrder(gained);
  } catch (e) { console.warn('Background refresh failed:', e); }
}
function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(() => { if (!document.hidden) quietRefresh(); }, 30000);
}
function stopPolling() { if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) quietRefresh(); });

async function checkAdmin(user) {
  const { data, error } = await db.from('admin_users').select('user_id, display_name, is_active').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data || data.is_active !== true) throw new Error('This account is not an active Achaas Cafe admin.');
  state.admin = data;
}
async function startApp(user) {
  state.user = user;
  await checkAdmin(user);
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('ownerName').textContent = state.admin.display_name || user.email || 'Owner';
  await loadAllData();
  if (window.location.hash) switchView(window.location.hash.replace('#', ''), false);
  startPolling();
}

async function loadAllData() {
  await Promise.all([
    loadCategories(),
    loadFoods(),
    loadOrders(),
    loadTodayOrders(),
    loadOverviewStats()
  ]);

  await loadDeletedCategories();
  await loadDeletedFoods();

  renderOverview();
  renderOrders();
  renderFoodGrid();
  renderCategoryList();
  renderSubcategoryList();
  populateCategorySelects();
}



async function loadCategories() {
  const [catResult, subResult] = await Promise.all([
    db.from('categories')
      .select('id,name,slug,description,image_url,sort_order,is_active')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),

    db.from('subcategories')
      .select('id,category_id,name,image_url,sort_order,is_active')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
  ]);

  if (catResult.error) throw catResult.error;
  if (subResult.error) throw subResult.error;

  state.categories = catResult.data || [];
  state.subcategories = subResult.data || [];
}

async function loadDeletedCategories() {

  const [catResult, subResult] = await Promise.all([

    db.from('categories')
      .select('id,name,slug,deleted_at,deleted_was_active')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),

    db.from('subcategories')
      .select('id,category_id,name,deleted_at,deleted_was_active,deleted_with_category_id')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

  ]);

  if (catResult.error) throw catResult.error;
  if (subResult.error) throw subResult.error;

  state.deletedCategories = catResult.data || [];
  state.deletedSubcategories = subResult.data || [];

  renderDeletedCategoryList();
  renderDeletedSubcategoryList();
}

async function loadFoods() {
  const { data, error } = await db
    .from('food_items')
    .select('id,category_id,subcategory_id,name,description,price,image_url,is_available,sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  state.foods = data || [];
}

async function loadDeletedFoods() {
  const { data, error } = await db
    .from('food_items')
    .select('id,category_id,name,price,is_available,deleted_at,deleted_was_available')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;
  state.deletedFoods = data || [];
  renderDeletedFoods();
}

function renderDeletedFoods() {
  $('deletedFoodsList').innerHTML = state.deletedFoods.length
    ? state.deletedFoods.map(food => `
      <article class="category-row">
        <div class="category-info">
          <strong>${escapeHtml(food.name)}</strong>
          <small>
            ${money(food.price)} · Deleted: ${escapeHtml(dateText(food.deleted_at))}
          </small>
        </div>
        <button class="small-btn"
                data-restore-food="${food.id}">
          Restore
        </button>
        <button class="small-btn danger"
                data-permanent-food="${food.id}">
          Permanently Delete
        </button>
      </article>
    `).join('')
    : '<p class="empty-state">No deleted food items.</p>';
}


async function loadOrders() {
  const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false }).limit(state.orderLimit);
  if (error) throw error;
  state.orders = data || [];
  const ids = state.orders.map(o => o.id);
  if (!ids.length) { state.orderItems = []; return; }
  const items = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = await db.from('order_items').select('id,order_id,food_item_id,food_name_snapshot,quantity,unit_price_at_order,subtotal').in('order_id', ids.slice(i, i + 100));
    if (chunk.error) throw chunk.error;
    items.push(...(chunk.data || []));
  }
  state.orderItems = items;
}
async function loadTodayOrders() {
  const bounds = indiaDayBounds();
  state.todayOrders = await fetchAll(() => db.from('orders')
    .select('id,total_amount,status,created_at')
    .gte('created_at', bounds.start)
    .lt('created_at', bounds.end)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }));
}
async function loadOverviewStats() {
  const count = async (status) => {
    let query = db.from('orders').select('id', { count: 'exact', head: true });
    if (Array.isArray(status)) query = query.in('status', status);
    else if (status) query = query.eq('status', status);
    const { count: total, error } = await query;
    if (error) throw error;
    return total || 0;
  };
  const [total, received, completed, completedRows] = await Promise.all([
    count(), count('received'), count(DONE_STATUSES),
    fetchAll(() => db.from('orders').select('id,total_amount').in('status', DONE_STATUSES).order('id', { ascending: true }))
  ]);
  state.stats = { total, received, completed, sales: currencySum(completedRows) };
}
function renderOverview() {
  const orders = state.orders;
  const today = state.todayOrders;
  const pendingToday = today.filter(o => ['received', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length;
  $('statTodayOrders').textContent = today.length;
  $('statTodayValue').textContent = money(currencySum(today, o => o.status !== 'cancelled'));
  $('statTodaySales').textContent = money(currencySum(today, o => DONE_STATUSES.includes(o.status)));
  $('statTodayPending').textContent = pendingToday;
  $('statTodayCancelled').textContent = today.filter(o => o.status === 'cancelled').length;
  const stats = state.stats || { total: 0, received: 0, completed: 0, sales: 0 };
  $('statOrders').textContent = stats.total;
  $('statNew').textContent = stats.received;
  $('statCompleted').textContent = stats.completed;
  $('statSales').textContent = money(stats.sales);
  const recent = orders.slice(0, 6);
  $('recentOrders').innerHTML = recent.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>${recent.map(o => `<tr><td>#${escapeHtml(o.order_number)}</td><td>${escapeHtml(o.customer_name_snapshot)}</td><td>${escapeHtml(dateText(o.created_at))}</td><td>${money(o.total_amount)}</td><td><span class="pill ${escapeHtml(o.status)}">${escapeHtml(statusLabel(o.status))}</span></td></tr>`).join('')}</tbody></table>` : '<p class="empty-state">No orders have been received yet.</p>';
  const newCount = stats.received;
  $('newOrderBadge').textContent = newCount;
  $('newOrderBadge').classList.toggle('hidden', newCount === 0);
}
/* WhatsApp / call buttons: the owner taps, WhatsApp opens with the message ready. */
function waNumber(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  return digits;
}
function statusMessage(order) {
  const name = String(order.customer_name_snapshot || '').trim().split(/\s+/)[0] || 'there';
  const n = order.order_number;
  const total = money(order.total_amount);
  const text = {
    received: `Hi ${name}, we have received your order #${n} at Achaas Cafe. Total: ${total}. We will confirm it shortly.`,
    accepted: `Hi ${name}, your order #${n} at Achaas Cafe has been accepted.`,
    preparing: `Hi ${name}, your order #${n} is being prepared.`,
    ready: `Hi ${name}, your order #${n} is ready.`,
    out_for_delivery: `Hi ${name}, your order #${n} is out for delivery and will reach you soon.`,
    completed: `Hi ${name}, your order #${n} is completed. Thank you for ordering from Achaas Cafe!`,
    delivered: `Hi ${name}, your order #${n} has been delivered. Enjoy your meal! Thank you for ordering from Achaas Cafe.`,
    cancelled: `Hi ${name}, sorry, your order #${n} at Achaas Cafe has been cancelled.` + (order.cancellation_reason ? ` Reason: ${order.cancellation_reason}.` : '')
  };
  return text[order.status] || `Hi ${name}, an update on your order #${n} at Achaas Cafe.`;
}
function contactButtons(o) {
  const wa = waNumber(o.customer_whatsapp_snapshot || o.customer_phone_snapshot);
  const call = String(o.customer_phone_snapshot || '').replace(/[^\d+]/g, '');
  const waBtn = wa.length >= 10 ? `<a class="small-btn contact-btn wa-btn" href="https://wa.me/${wa}?text=${encodeURIComponent(statusMessage(o))}" target="_blank" rel="noopener">WhatsApp update</a>` : '';
  const callBtn = call ? `<a class="small-btn contact-btn" href="tel:${escapeHtml(call)}">Call</a>` : '';
  return waBtn + callBtn;
}

function renderOrders() {
  const search = ($('orderSearch')?.value || '').trim().toLowerCase();
  const filter = $('orderStatusFilter')?.value || 'all';
  const orders = state.orders.filter(o => {
    const matchesStatus = filter === 'all' || o.status === filter;
    const haystack = [o.order_number, o.customer_name_snapshot, o.customer_phone_snapshot, o.customer_whatsapp_snapshot].join(' ').toLowerCase();
    return matchesStatus && haystack.includes(search);
  });
  $('ordersList').innerHTML = orders.length ? orders.map(o => {
    const items = state.orderItems.filter(i => i.order_id === o.id);
    const itemText = items.map(i => `${escapeHtml(i.food_name_snapshot)} × ${Number(i.quantity)} (${money(i.subtotal ?? Number(i.unit_price_at_order) * Number(i.quantity))})`).join('<br>') || 'No item details found';
    const options = (statusOptions.includes(o.status) ? statusOptions : [...statusOptions, o.status]).map(s => `<option value="${escapeHtml(s)}" ${o.status === s ? 'selected' : ''}>${escapeHtml(statusLabel(s))}</option>`).join('');
    return `<article class="order-card${o.status === 'received' ? ' is-new' : ''}"><div class="order-top"><div><h3>Order #${escapeHtml(o.order_number)}</h3><div class="order-meta">${escapeHtml(dateText(o.created_at))} · ${escapeHtml(o.customer_name_snapshot)}</div></div><span class="pill ${escapeHtml(o.status)}">${escapeHtml(statusLabel(o.status))}</span></div><div class="order-details"><div><strong>Customer details</strong><p>${escapeHtml(o.customer_name_snapshot)}<br>${escapeHtml(o.customer_phone_snapshot)}${o.customer_whatsapp_snapshot ? `<br>WhatsApp: ${escapeHtml(o.customer_whatsapp_snapshot)}` : ''}<br>${escapeHtml(o.delivery_address_snapshot)}</p>${o.food_preferences ? `<p><b>Preferences:</b> ${escapeHtml(Array.isArray(o.food_preferences) ? o.food_preferences.join(', ') : o.food_preferences)}</p>` : ''}${o.special_instructions ? `<p><b>Instructions:</b> ${escapeHtml(o.special_instructions)}</p>` : ''}</div><div><strong>Order items</strong><p class="order-items">${itemText}</p><strong>Total: ${money(o.total_amount)}</strong>${o.cancellation_reason ? `<p><b>Cancellation reason:</b> ${escapeHtml(o.cancellation_reason)}</p>` : ''}</div></div><div class="order-actions"><label class="muted" for="status-${o.id}">Update status</label><select id="status-${o.id}" aria-label="Update order status">${options}</select><button class="primary-btn" data-save-status="${o.id}">Save status</button>${contactButtons(o)}</div></article>`;
  }).join('') : '<p class="empty-state">No orders match this filter.</p>';
  if (state.orders.length >= state.orderLimit) $('ordersList').insertAdjacentHTML('beforeend', '<button type="button" class="outline-btn orders-more" data-load-more>Load older orders</button>');
}


function renderFoodGrid() {
  const search = ($('foodSearch')?.value || '').trim().toLowerCase();
  const cat = $('foodCategoryFilter')?.value || 'all';
  const foods = state.foods.filter(f => (cat === 'all' || f.category_id === cat) && `${f.name} ${f.description || ''}`.toLowerCase().includes(search));
  $('foodGrid').innerHTML = foods.length ? foods.map(f => {
    
    const category = [
      ...state.categories,
      ...state.deletedCategories
    ].find(c => c.id === f.category_id)?.name || 'Uncategorised';
    
    const image = f.image_url || '';
    return `<article class="food-card">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(f.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="food-card-body">
        <h3>${escapeHtml(f.name)}</h3>
        <p>${escapeHtml(category)} · ${f.is_available ? 'Available' : 'Unavailable'}</p>
        <div class="price">${money(f.price)}</div>
        <div class="food-card-actions">
          <button class="small-btn" data-edit-food="${f.id}">Edit</button>
          <button class="small-btn" data-toggle-food="${f.id}">
            ${f.is_available ? 'Mark unavailable' : 'Make available'}
          </button>
          <button class="small-btn danger" data-archive-food="${f.id}">
            Delete
          </button>
        </div>
      </div>
    </article>`;
  }).join('') : '<p class="empty-state">No food items found.</p>';
}



function renderCategoryList() {

  $('categoryList').innerHTML = state.categories.length
    ? state.categories.map(c => `
      <article class="category-row">

        ${c.image_url
          ? `<img src="${escapeHtml(c.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : ''}

        <div class="category-info">
          <strong>${escapeHtml(c.name)}</strong>
          <small>
            ${escapeHtml(c.slug)} ·
            ${c.is_active ? 'Active' : 'Inactive'} ·
            ${state.foods.filter(f => f.category_id === c.id).length} food items
          </small>
        </div>

        <button class="small-btn"
                data-edit-category="${c.id}">
          Edit
        </button>

        <button class="small-btn"
                data-toggle-category="${c.id}">
          ${c.is_active ? 'Deactivate' : 'Activate'}
        </button>

        <button class="small-btn danger"
                data-archive-category="${c.id}">
          Delete
        </button>

      </article>
    `).join('')
    : '<p class="empty-state">No categories found.</p>';
}


function renderSubcategoryList() {

  $('subcategoryList').innerHTML = state.subcategories.length
    ? state.subcategories.map(s => {

      const categoryName =
        state.categories.find(c => c.id === s.category_id)?.name ||
        'Unknown category';

      const assignedCount =
        state.foods.filter(f => f.subcategory_id === s.id).length;

      return `
        <article class="category-row">

          ${s.image_url
            ? `<img src="${escapeHtml(s.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : ''}

          <div class="category-info">
            <strong>${escapeHtml(s.name)}</strong>
            <small>
              ${escapeHtml(categoryName)} ·
              ${s.is_active ? 'Active' : 'Inactive'} ·
              ${assignedCount} food items
            </small>
          </div>

          <button class="small-btn"
                  data-edit-subcategory="${s.id}">
            Edit
          </button>

          <button class="small-btn"
                  data-toggle-subcategory="${s.id}">
            ${s.is_active ? 'Deactivate' : 'Activate'}
          </button>

          <button class="small-btn danger"
                  data-archive-subcategory="${s.id}">
            Delete
          </button>

        </article>
      `;

    }).join('')
    : '<p class="empty-state">No subcategories found. Add one to organise your menu.</p>';
}


function renderDeletedCategoryList() {

  const list = $('deletedCategoryList');

  if (!list) return;

  list.innerHTML = state.deletedCategories.length
    ? state.deletedCategories.map(c => {

      const childNames = state.deletedSubcategories
        .filter(s => s.deleted_with_category_id === c.id)
        .map(s => escapeHtml(s.name));

      return `
        <article class="category-row">

          <div class="category-info">
            <strong>${escapeHtml(c.name)}</strong>

            <small>
              Deleted: ${escapeHtml(dateText(c.deleted_at))}
            </small>

            ${childNames.length
              ? `<small class="trash-children">
                   Subcategories archived with this category:
                   ${childNames.join(', ')}
                 </small>`
              : ''
            }
          </div>

          <button class="small-btn"
                  data-restore-category="${c.id}">
            Restore
          </button>

          <button class="small-btn danger"
                  data-permanent-category="${c.id}">
            Permanently Delete
          </button>

        </article>
      `;

    }).join('')
    : '<p class="empty-state">No deleted categories.</p>';
}


function renderDeletedSubcategoryList() {

  const list = $('deletedSubcategoryList');

  if (!list) return;

  // Children archived together with a parent are shown
  // inside that parent's deleted-category card.
  const standalone = state.deletedSubcategories.filter(
    s => !s.deleted_with_category_id
  );

  list.innerHTML = standalone.length
    ? standalone.map(s => {

      const parent = [
        ...state.categories,
        ...state.deletedCategories
      ].find(c => c.id === s.category_id);

      const parentName = parent?.name || 'Unknown category';

      return `
        <article class="category-row">

          <div class="category-info">
            <strong>${escapeHtml(s.name)}</strong>
            <small>
              ${escapeHtml(parentName)} ·
              Deleted: ${escapeHtml(dateText(s.deleted_at))}
            </small>
          </div>

          <button class="small-btn"
                  data-restore-subcategory="${s.id}">
            Restore
          </button>

          <button class="small-btn danger"
                  data-permanent-subcategory="${s.id}">
            Permanently Delete
          </button>

        </article>
      `;

    }).join('')
    : '<p class="empty-state">No separately deleted subcategories.</p>';
}

async function performCategoryTrash(entityType, id, action) {

  if (action === 'archive') {

    const message = entityType === 'category'
      ? 'Move this category and all its subcategories to Deleted? Food items will be preserved.'
      : 'Move this subcategory to Deleted? Its food items will be preserved.';

    if (!window.confirm(message)) return;
  }

  if (action === 'permanent_delete') {

    const message = entityType === 'category'
      ? 'Permanently delete this category and its subcategories? This cannot be undone. Linked food items will prevent deletion.'
      : 'Permanently delete this subcategory? This cannot be undone. Linked food items will prevent deletion.';

    if (!window.confirm(message)) return;
  }

  const { data, error } = await db.rpc('manage_category_trash', {
    p_entity_type: entityType,
    p_entity_id: id,
    p_action: action
  });

  if (error) throw error;

  await loadCategories();
  await loadFoods();
  await loadDeletedCategories();

  renderFoodGrid();
  renderCategoryList();
  renderSubcategoryList();
  populateCategorySelects();

  showMessage(data?.message || 'Category information updated.');
}


function renderGallery() {
  $('galleryGrid').innerHTML = state.gallery.length ? state.gallery.map(g => `<article class="food-card">${g.image_url ? `<img src="${escapeHtml(g.image_url)}" alt="${escapeHtml(g.title || 'Cafe gallery image')}" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="food-card-body"><h3>${escapeHtml(g.title || 'Untitled image')}</h3><p>${escapeHtml(g.image_type || 'general')} · ${g.is_active ? 'Visible' : 'Hidden'}</p><p>${escapeHtml(g.description || '')}</p><div class="food-card-actions"><button class="small-btn" data-edit-gallery="${g.id}">Edit</button><button class="small-btn" data-toggle-gallery="${g.id}">${g.is_active ? 'Hide' : 'Show'}</button></div></div></article>`).join('') : '<p class="empty-state">No gallery images found.</p>';
}
function populateCategorySelects() {
  const label = (c) => escapeHtml(c.name) + (c.is_active ? '' : ' (inactive)');
  const options = state.categories.map(c => `<option value="${c.id}">${label(c)}</option>`).join('');
  const firstActive = state.categories.find(c => c.is_active)?.id || state.categories[0]?.id || '';
  const keep = (select, html, filterHtml) => {
    const previous = select.value;
    select.innerHTML = html || '<option value="">No categories yet</option>';
    select.value = [...select.options].some(o => o.value === previous) ? previous : firstActive;
  };
  keep($('foodCategory'), options);
  $('foodCategoryFilter').innerHTML = '<option value="all">All categories</option>' + options;
  keep($('subcategoryCategory'), options);
  updateSubcategoryOptions();
}
function updateSubcategoryOptions(selectedId = '') {
  const catId = $('foodCategory').value;
  const keepId = selectedId || $('foodSubcategory').value;
  const subs = state.subcategories.filter(s => s.category_id === catId && (s.is_active || s.id === keepId));
  $('foodSubcategory').innerHTML = '<option value="">No subcategory</option>' + subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.is_active ? '' : ' (inactive)'}</option>`).join('');
  if (keepId && subs.some(s => s.id === keepId)) $('foodSubcategory').value = keepId;
}
function switchView(name, updateHistory = true) {

const validViews = [
  'overview',
  'orders',
  'menu',
  'categories',
  'subcategories',
  'deletedCategories',
  'deletedFoods',
  'gallery',
  'coupons',
  'settings',
  'appearance',
  'reports'
];

  if (!validViews.includes(name)) name = 'overview';
  state.currentView = name;
  if (name === 'orders') clearNewOrderAlert();
  window.scrollTo(0, 0);
  document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
  $(`${name}View`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const titles = { overview: 'Overview', orders: 'Orders', menu: 'Food items', categories: 'Categories', subcategories: 'Subcategories',deletedCategories: 'Deleted Categories & Subcategories', gallery: 'Gallery',coupons: 'Coupons & Delivery', settings: 'Cafe settings', appearance: 'Website appearance', reports: 'Sales reports' };
  $('pageTitle').textContent = titles[name] || 'Dashboard';
  if (updateHistory) {
    const url = new URL(window.location.href);
    url.hash = name;
    if (window.location.hash !== `#${name}`) history.pushState({ adminView: name }, '', url);
  }
  if (name === 'gallery') loadGallery().catch(e => showMessage(e.message, true));
  if (name === 'settings' || name === 'appearance') loadSettings().then(() => { if (name === 'appearance') populateThemeEditor(); }).catch(e => showMessage(e.message, true));
  if (name === 'reports') loadReports().catch(e => showMessage(e.message, true));
  if (name === 'deletedCategories') {
  loadDeletedCategories().catch(e => showMessage(e.message, true));
}
  if (name === 'coupons') {
  loadCoupons().catch(e => showMessage(e.message, true));
}
}
async function prepareImage(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  if (!allowed.includes(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  let output = file;
  if (file.type !== 'image/gif' && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      if (scale < 1 || file.size > 1.5 * 1024 * 1024) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (bitmap.close) bitmap.close();
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.86));
        if (blob && blob.size < file.size) output = blob;
      }
    } catch (e) { console.warn('Image resize skipped:', e); }
  }
  if (output.size > 6 * 1024 * 1024) throw new Error('Image is still larger than 6 MB. Please choose a smaller image.');
  return output;
}
async function uploadImage(file, folder) {
  if (!file) return null;
  const prepared = await prepareImage(file);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[prepared.type] || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, prepared, { cacheControl: '3600', upsert: false, contentType: prepared.type });
  if (error) throw error;
  const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
function openFoodForm(food = null) {
  $('foodForm').reset(); $('foodId').value = food?.id || '';
  $('foodFormTitle').textContent = food ? 'Edit food item' : 'Add food item';
  $('foodName').value = food?.name || ''; $('foodPrice').value = food?.price ?? '';
  $('foodDescription').value = food?.description || ''; $('foodAvailable').checked = food?.is_available ?? true;
  
  
 if (food?.category_id) {

  const select = $('foodCategory');

  const exists = [...select.options].some(
    option => option.value === food.category_id
  );

  if (!exists) {

    const deletedCategory = state.deletedCategories.find(
      c => c.id === food.category_id
    );

    if (deletedCategory) {

      const option = document.createElement('option');

      option.value = deletedCategory.id;

      option.textContent =
        deletedCategory.name + ' (Deleted - choose another category)';

      select.appendChild(option);
    }
  }

  select.value = food.category_id;

} else {

  const firstActive = state.categories.find(c => c.is_active);

  if (firstActive) $('foodCategory').value = firstActive.id;

}
 
  
  $('foodSubcategory').value = '';
  updateSubcategoryOptions(food?.subcategory_id || '');
  $('foodFormPanel').classList.remove('hidden'); $('foodFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setFormMessage('foodFormMessage', '');
}
function openCategoryForm(category = null) {
  $('categoryForm').reset(); $('categoryId').value = category?.id || '';
  $('categoryFormTitle').textContent = category ? 'Edit category' : 'Add category';
  $('categoryName').value = category?.name || ''; $('categorySlug').value = category?.slug || '';
  $('categoryDescription').value = category?.description || ''; $('categorySort').value = category?.sort_order ?? 0;
  $('categoryActive').checked = category?.is_active ?? true;
  $('categoryFormPanel').classList.remove('hidden'); $('categoryFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setFormMessage('categoryFormMessage', '');
}
function openSubcategoryForm(subcategory = null) {
  $('subcategoryForm').reset(); $('subcategoryId').value = subcategory?.id || '';
  $('subcategoryFormTitle').textContent = subcategory ? 'Edit subcategory' : 'Add subcategory';
  populateCategorySelects();
  $('subcategoryCategory').value = subcategory?.category_id || state.categories.find(c => c.is_active)?.id || '';
  $('subcategoryName').value = subcategory?.name || '';
  $('subcategorySort').value = subcategory?.sort_order ?? 0;
  $('subcategoryActive').checked = subcategory?.is_active ?? true;
  $('subcategoryFormPanel').classList.remove('hidden'); $('subcategoryFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setFormMessage('subcategoryFormMessage', '');
}
function openGalleryForm(item = null) {
  $('galleryForm').reset(); $('galleryId').value = item?.id || '';
  $('galleryFormTitle').textContent = item ? 'Edit gallery image' : 'Add gallery image';
  $('galleryTitle').value = item?.title || ''; $('galleryType').value = item?.image_type || 'general';
  $('galleryDescription').value = item?.description || ''; $('gallerySort').value = item?.sort_order ?? 0;
  $('galleryActive').checked = item?.is_active ?? true;
  $('galleryFormPanel').classList.remove('hidden'); $('galleryFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setFormMessage('galleryFormMessage', '');
}

async function loadGallery() {
  const { data, error } = await db.from('gallery_images').select('id,image_url,title,description,image_type,sort_order,is_active,created_at').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) throw error;
  state.gallery = data || [];
  renderGallery();
}
async function loadSettings() {
  // theme_settings is added by the SQL migration included in the download package.
  const { data, error } = await db.from('cafe_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  state.settings = data || null;
  state.themeSettings = { ...themeDefaults, ...(data?.theme_settings || {}) };
  if (!data) return;
  const social = data.social_links && typeof data.social_links === 'object' ? data.social_links : {};
  $('settingCafeName').value = data.cafe_name || '';
  $('settingPhone').value = data.phone || '';
  $('settingAlternatePhone').value = data.alternate_phone || '';
  $('settingEmail').value = data.email || '';
  $('settingAddress').value = data.address || '';
  $('settingMaps').value = data.maps_url || '';
  $('settingHours').value = data.opening_hours || '';
  $('settingHolidays').value = data.weekly_holidays || '';
  $('settingInstagram').value = social.instagram || '';
  $('settingFacebook').value = social.facebook || '';
  state.themeSettings = { ...themeDefaults, ...(data.theme_settings || {}) };
}
function readThemeInputs() {
  return {
    name: state.themeSettings.name || 'custom',
    primary: $('themePrimary').value,
    background: $('themeBackground').value,
    surface: $('themeSurface').value,
    text: $('themeText').value,
    muted: $('themeMuted').value,
    accent: $('themeAccent').value
  };
}

function renderThemePreview(theme) {
  const preview = $('themePreview');
  if (!preview) return;
  preview.style.setProperty('--preview-primary', theme.primary);
  preview.style.setProperty('--preview-background', theme.background);
  preview.style.setProperty('--preview-surface', theme.surface);
  preview.style.setProperty('--preview-text', theme.text);
  preview.style.setProperty('--preview-muted', theme.muted);
  preview.style.setProperty('--preview-accent', theme.accent);
  let box = $('themeWarning');
  if (!box) {
    box = document.createElement('div');
    box.id = 'themeWarning';
    box.className = 'theme-warning';
    box.setAttribute('role', 'status');
    $('themeMessage').before(box);
  }
  const { block, warn } = themeProblems(theme);
  box.innerHTML = block.map(m => `<p class="tw-block">⛔ ${escapeHtml(m)}</p>`).join('') + warn.map(m => `<p>⚠️ ${escapeHtml(m)}</p>`).join('');
  box.classList.toggle('hidden', !block.length && !warn.length);
}
function populateThemeEditor() {
  const theme = { ...themeDefaults, ...(state.themeSettings || {}) };
  $('themePrimary').value = theme.primary;
  $('themeBackground').value = theme.background;
  $('themeSurface').value = theme.surface;
  $('themeText').value = theme.text;
  $('themeMuted').value = theme.muted;
  $('themeAccent').value = theme.accent;
  renderThemePreview(theme);
  document.querySelectorAll('[data-theme-preset]').forEach(b => b.classList.toggle('selected', b.dataset.themePreset === theme.name));
}
async function loadReports() {
  const days = Number($('reportRange').value || 30);
  const todayKey = indiaDateKey();
  const firstKey = shiftDateKey(todayKey, -(days - 1));
  const start = indiaDayBounds(firstKey).start;
  state.reportOrders = await fetchAll(() => db.from('orders')
    .select('id,total_amount,status,created_at')
    .gte('created_at', start)
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
  renderReports(days, firstKey, todayKey);
}
function renderReports(days, firstKey, todayKey) {
  const rows = state.reportOrders;
  const completed = rows.filter(o => DONE_STATUSES.includes(o.status));
  const cancelled = rows.filter(o => o.status === 'cancelled');
  const total = currencySum(completed);
  $('reportSales').textContent = money(total);
  $('reportOrders').textContent = completed.length;
  $('reportAverage').textContent = money(completed.length ? total / completed.length : 0);
  $('reportCancelled').textContent = cancelled.length;
  const totalsByDay = new Map();
  for (let offset = 0; offset < days; offset++) totalsByDay.set(shiftDateKey(firstKey, offset), 0);
  completed.forEach(order => {
    const key = indiaDateKey(new Date(order.created_at));
    if (totalsByDay.has(key)) totalsByDay.set(key, totalsByDay.get(key) + Number(order.total_amount || 0));
  });
  const entries = [...totalsByDay.entries()];
  const weekly = days > 31;
  const buckets = [];
  if (weekly) {
    for (let i = 0; i < entries.length; i += 7) {
      const chunk = entries.slice(i, i + 7);
      buckets.push({ label: chunk[0][0].slice(5) + ' wk', title: `${chunk[0][0]} to ${chunk[chunk.length - 1][0]}`, value: chunk.reduce((sum, [, v]) => sum + v, 0) });
    }
  } else {
    entries.forEach(([day, value]) => buckets.push({ label: day.slice(5), title: day, value }));
  }
  const maxValue = Math.max(1, ...buckets.map(b => b.value));
  const note = weekly ? '<p class="muted small-note">Each bar shows the total for one week (7 days).</p>' : '';
  $('salesBars').innerHTML = (completed.length ? note + buckets.map(b => {
    const percent = b.value > 0 ? Math.max(2, b.value / maxValue * 100) : 0;
    return `<div class="sales-bar-row" title="${escapeHtml(b.title)}"><span>${escapeHtml(b.label)}</span><div class="sales-bar-track"><div class="sales-bar-fill" style="width:${percent}%"></div></div><span class="sales-bar-value">${money(b.value)}</span></div>`;
  }).join('') : '') || '<p class="empty-state">No completed sales in this period.</p>';
}
// Login and session handling
$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('loginForm').querySelector('button[type=submit]');
  setBusy(button, true, 'Signing in…'); setFormMessage('loginMessage', '');
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    if (error) throw error;
    await startApp(data.user);
  } catch (error) {
    await db.auth.signOut();
    setFormMessage('loginMessage', error.message || 'Unable to sign in.', true);
  } finally { setBusy(button, false); }
});

$('forgotPasswordBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();

  if (!email) {
    setFormMessage('loginMessage', 'Please enter your registered admin email.', true);
    $('loginEmail').focus();
    return;
  }

  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://achaascafe-sketch.github.io/achaas-cafe/admin.html'
    });

    if (error) throw error;

    setFormMessage(
      'loginMessage',
      'If this email is registered, a recovery email will be sent.'
    );
  } catch (error) {
    setFormMessage('loginMessage', error.message, true);
  }
});

$('passwordRecoveryForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = $('newAdminPassword').value;
    const confirmPassword = $('confirmAdminPassword').value;

    if (password.length < 10) {
        setFormMessage(
            'recoveryMessage',
            'Password must contain at least 10 characters.',
            true
        );
        return;
    }

    if (password !== confirmPassword) {
        setFormMessage(
            'recoveryMessage',
            'Passwords do not match.',
            true
        );
        return;
    }

    try {
        const { error } = await db.auth.updateUser({
            password: password
        });

        if (error) throw error;

        await db.auth.signOut();

        $('passwordRecoveryForm').reset();
        history.replaceState(null, '', window.location.pathname);
        $('passwordRecoveryView').classList.add('hidden');
        $('loginView').classList.remove('hidden');

        setFormMessage(
            'loginMessage',
            'Password updated successfully. Please sign in.'
        );

    } catch (error) {
        setFormMessage(
            'recoveryMessage',
            error.message || 'Unable to update password.',
            true
        );
    }
});

function clearAdminData() {
  stopPolling();
  clearNewOrderAlert();
  
  Object.assign(state, { user: null, admin: null, orders: [], todayOrders: [], orderItems: [], categories: [], subcategories: [],deletedCategories: [], deletedSubcategories: [],

deletedCategories: [], deletedSubcategories: [],
foods: [], gallery: [], settings: null,reportOrders: [], stats: null, currentView: 'overview', orderLimit: 150 });
  
    [
  'ordersList',
  'recentOrders',
  'foodGrid',
  'categoryList',
  'subcategoryList',
  'deletedCategoryList',
  'deletedSubcategoryList',
  'galleryGrid',
  'salesBars'
].forEach(id => {
    
  if ($(id)) $(id).innerHTML = ''; });
  
  $('ownerName').textContent = '';
  ['statOrders', 'statNew', 'statCompleted', 'statTodayOrders', 'statTodayPending', 'statTodayCancelled'].forEach(id => { if ($(id)) $(id).textContent = '0'; });
  ['statSales', 'statTodayValue', 'statTodaySales'].forEach(id => { if ($(id)) $(id).textContent = money(0); });
  $('newOrderBadge').textContent = '0';
  $('newOrderBadge').classList.add('hidden');
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  $('loginPassword').value = '';
}
$('logoutBtn').addEventListener('click', async () => {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  } catch (error) {
    showMessage('Logout error: ' + error.message, true);
  } finally {
    clearAdminData();
  }
});
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.goto)));
window.addEventListener('popstate', () => switchView(window.location.hash.replace('#', '') || 'overview', false));
$('refreshOverview').addEventListener('click', refreshAll);
$('refreshOrders').addEventListener('click', refreshAll);
async function refreshAll() {
  try { await loadAllData(); showMessage('Dashboard data refreshed.'); }
  catch (e) { showMessage(e.message, true); }
}
$('orderSearch').addEventListener('input', renderOrders);
$('orderStatusFilter').addEventListener('change', renderOrders);
$('foodSearch').addEventListener('input', renderFoodGrid);
$('foodCategoryFilter').addEventListener('change', renderFoodGrid);
$('foodCategory').addEventListener('change', () => { $('foodSubcategory').value = ''; updateSubcategoryOptions(); });
$('addFoodBtn').addEventListener('click', () => openFoodForm());
$('closeFoodForm').addEventListener('click', () => $('foodFormPanel').classList.add('hidden'));
$('cancelFoodForm').addEventListener('click', () => $('foodFormPanel').classList.add('hidden'));
$('addCategoryBtn').addEventListener('click', () => openCategoryForm());
$('closeCategoryForm').addEventListener('click', () => $('categoryFormPanel').classList.add('hidden'));
$('cancelCategoryForm').addEventListener('click', () => $('categoryFormPanel').classList.add('hidden'));
$('addSubcategoryBtn').addEventListener('click', () => openSubcategoryForm());
$('closeSubcategoryForm').addEventListener('click', () => $('subcategoryFormPanel').classList.add('hidden'));
$('cancelSubcategoryForm').addEventListener('click', () => $('subcategoryFormPanel').classList.add('hidden'));
$('addGalleryBtn').addEventListener('click', () => openGalleryForm());
$('closeGalleryForm').addEventListener('click', () => $('galleryFormPanel').classList.add('hidden'));
$('cancelGalleryForm').addEventListener('click', () => $('galleryFormPanel').classList.add('hidden'));
$('refreshSettings').addEventListener('click', () => loadSettings().then(() => showMessage('Cafe settings reloaded.')).catch(e => showMessage(e.message, true)));
$('reportRange').addEventListener('change', () => loadReports().catch(e => showMessage(e.message, true)));

$('ordersList').addEventListener('click', async (event) => {
  const more = event.target.closest('[data-load-more]');
  if (more) {
    setBusy(more, true, 'Loading…');
    state.orderLimit += 150;
    try { await loadOrders(); renderOrders(); } catch (e) { showMessage(e.message, true); setBusy(more, false); }
    return;
  }
  const button = event.target.closest('[data-save-status]'); if (!button) return;
  const id = button.dataset.saveStatus; const status = $(`status-${id}`).value;
  const order = state.orders.find(o => o.id === id);
  if (order && order.status === status) { showMessage(`This order is already ${status}.`); return; }
  const patch = { status };
  if (status === 'cancelled') {
    const reason = window.prompt('Reason for cancelling this order (optional):', order?.cancellation_reason || '');
    if (reason === null) return;
    patch.cancellation_reason = reason.trim() || null;
  } else if (order?.cancellation_reason) {
    patch.cancellation_reason = null;
  }
  setBusy(button, true, 'Saving…');
  try {
    const { data, error } = await db.from('orders').update(patch).eq('id', id).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('The order was not updated. Check that this account is allowed to edit orders.');
    await Promise.all([loadOrders(), loadTodayOrders(), loadOverviewStats()]);
    renderOrders(); renderOverview(); showMessage(`Order status updated to ${status}.`);
  } catch (e) { showMessage(e.message, true); }
  finally { setBusy(button, false); }
});



$('foodGrid').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-food]');
  const toggle = event.target.closest('[data-toggle-food]');
  const archive = event.target.closest('[data-archive-food]');

  if (edit) {
    const food = state.foods.find(f => f.id === edit.dataset.editFood);
    if (food) openFoodForm(food);
    return;
  }

  if (toggle) {
    const food = state.foods.find(f => f.id === toggle.dataset.toggleFood);
    if (!food) return;

    toggle.disabled = true;

    try {
      const { error } = await db
        .from('food_items')
        .update({ is_available: !food.is_available })
        .eq('id', food.id);

      if (error) throw error;

      await loadFoods();
      renderFoodGrid();
      showMessage('Food availability updated.');
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      toggle.disabled = false;
    }

    return;
  }

  if (archive) {
    const food = state.foods.find(f => f.id === archive.dataset.archiveFood);
    if (!food) return;

    if (!confirm(`Move "${food.name}" to Deleted Food Items?`)) return;

    archive.disabled = true;

    try {
      const { error } = await db
        .from('food_items')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_was_available: food.is_available,
          is_available: false
        })
        .eq('id', food.id);

      if (error) throw error;

      await Promise.all([loadFoods(), loadDeletedFoods()]);
      renderFoodGrid();
      showMessage('Food item moved to Deleted Food Items.');
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      archive.disabled = false;
    }
  }
});


$('deletedFoodsList').addEventListener('click', async (event) => {
  const restore = event.target.closest('[data-restore-food]');
  const permanent = event.target.closest('[data-permanent-food]');

  if (restore) {
    const food = state.deletedFoods.find(
      f => f.id === restore.dataset.restoreFood
    );

    if (!food) return;

    if (!confirm(`Restore "${food.name}"?`)) return;

    restore.disabled = true;

    try {
      const { error } = await db
        .from('food_items')
        .update({
          deleted_at: null,
          deleted_was_available: null,
          is_available: food.deleted_was_available ?? false
        })
        .eq('id', food.id);

      if (error) throw error;

      await Promise.all([loadFoods(), loadDeletedFoods()]);
      renderFoodGrid();
      showMessage('Food item restored.');
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      restore.disabled = false;
    }

    return;
  }

  if (permanent) {
    const food = state.deletedFoods.find(
      f => f.id === permanent.dataset.permanentFood
    );

    if (!food) return;

    if (!confirm(
      `Permanently delete "${food.name}"? This cannot be undone.`
    )) return;

    permanent.disabled = true;

    try {
      const { error } = await db
        .from('food_items')
        .delete()
        .eq('id', food.id);

      if (error) throw error;

      await loadDeletedFoods();
      showMessage('Food item permanently deleted.');
    } catch (e) {
      showMessage(
        'Could not permanently delete this item. It may be linked to an existing order. It will remain in Deleted Food Items. ' + e.message,
        true
      );
    } finally {
      permanent.disabled = false;
    }
  }
});



$('categoryList').addEventListener('click', async (event) => {

  const edit = event.target.closest('[data-edit-category]');
  const toggle = event.target.closest('[data-toggle-category]');
  const archive = event.target.closest('[data-archive-category]');

  if (edit) {
    const category = state.categories.find(
      c => c.id === edit.dataset.editCategory
    );

    if (category) openCategoryForm(category);
    return;
  }

  if (archive) {

    archive.disabled = true;

    try {
      await performCategoryTrash(
        'category',
        archive.dataset.archiveCategory,
        'archive'
      );
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      archive.disabled = false;
    }

    return;
  }

  if (toggle) {

    const category = state.categories.find(
      c => c.id === toggle.dataset.toggleCategory
    );

    if (!category) return;

    const hasActiveFood = state.foods.some(
      f => f.category_id === category.id && f.is_available
    );

    if (
      category.is_active &&
      hasActiveFood &&
      !confirm('This category has available food items. Deactivating it will hide them from customers. Continue?')
    ) return;

    toggle.disabled = true;

    try {
      const { error } = await db
        .from('categories')
        .update({ is_active: !category.is_active })
        .eq('id', category.id);

      if (error) throw error;

      await loadCategories();

      renderCategoryList();
      renderSubcategoryList();
      populateCategorySelects();

      showMessage('Category status updated.');

    } catch (e) {
      showMessage(e.message, true);
    } finally {
      toggle.disabled = false;
    }
  }
});


$('subcategoryList').addEventListener('click', async (event) => {

  const edit = event.target.closest('[data-edit-subcategory]');
  const toggle = event.target.closest('[data-toggle-subcategory]');
  const archive = event.target.closest('[data-archive-subcategory]');

  if (edit) {

    const sub = state.subcategories.find(
      s => s.id === edit.dataset.editSubcategory
    );

    if (sub) openSubcategoryForm(sub);
    return;
  }

  if (archive) {

    archive.disabled = true;

    try {
      await performCategoryTrash(
        'subcategory',
        archive.dataset.archiveSubcategory,
        'archive'
      );
    } catch (e) {
      showMessage(e.message, true);
    } finally {
      archive.disabled = false;
    }

    return;
  }

  if (toggle) {

    const sub = state.subcategories.find(
      s => s.id === toggle.dataset.toggleSubcategory
    );

    if (!sub) return;

    const inUse = state.foods.some(
      f => f.subcategory_id === sub.id
    );

    if (
      sub.is_active &&
      inUse &&
      !confirm('Food items use this subcategory. Deactivating it may hide those items from customers. Continue?')
    ) return;

    toggle.disabled = true;

    try {

      const { error } = await db
        .from('subcategories')
        .update({ is_active: !sub.is_active })
        .eq('id', sub.id);

      if (error) throw error;

      await loadCategories();

      renderSubcategoryList();
      populateCategorySelects();

      showMessage('Subcategory status updated.');

    } catch (e) {
      showMessage(e.message, true);
    } finally {
      toggle.disabled = false;
    }
  }
});



$('galleryGrid').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-gallery]'); const toggle = event.target.closest('[data-toggle-gallery]');
  if (edit) { const item = state.gallery.find(g => g.id === edit.dataset.editGallery); if (item) openGalleryForm(item); }
  if (toggle) {
    const item = state.gallery.find(g => g.id === toggle.dataset.toggleGallery); if (!item) return;
    toggle.disabled = true;
    try { const { error } = await db.from('gallery_images').update({ is_active: !item.is_active }).eq('id', item.id); if (error) throw error; await loadGallery(); showMessage('Gallery visibility updated.'); }
    catch (e) { showMessage(e.message, true); } finally { toggle.disabled = false; }
  }
});



$('deletedCategoryList').addEventListener('click', async (event) => {

  const restore = event.target.closest('[data-restore-category]');
  const permanent = event.target.closest('[data-permanent-category]');

  try {

    if (restore) {
      await performCategoryTrash(
        'category',
        restore.dataset.restoreCategory,
        'restore'
      );
    }

    if (permanent) {
      await performCategoryTrash(
        'category',
        permanent.dataset.permanentCategory,
        'permanent_delete'
      );
    }

  } catch (e) {
    showMessage(e.message, true);
  }
});


$('deletedSubcategoryList').addEventListener('click', async (event) => {

  const restore = event.target.closest('[data-restore-subcategory]');
  const permanent = event.target.closest('[data-permanent-subcategory]');

  try {

    if (restore) {
      await performCategoryTrash(
        'subcategory',
        restore.dataset.restoreSubcategory,
        'restore'
      );
    }

    if (permanent) {
      await performCategoryTrash(
        'subcategory',
        permanent.dataset.permanentSubcategory,
        'permanent_delete'
      );
    }

  } catch (e) {
    showMessage(e.message, true);
  }
});


$('refreshDeletedCategories').addEventListener('click', async () => {

  try {
    await loadDeletedCategories();
    showMessage('Deleted categories refreshed.');
  } catch (e) {
    showMessage(e.message, true);
  }

});

$('foodForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('foodForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('foodFormMessage', '');
  try {
    const id = $('foodId').value;
    const file = $('foodImage').files[0]; const uploadedUrl = file ? await uploadImage(file, 'food-items') : null;
    const payload = { name: $('foodName').value.trim(), category_id: $('foodCategory').value, subcategory_id: $('foodSubcategory').value || null, description: $('foodDescription').value.trim() || null, price: Number($('foodPrice').value), is_available: $('foodAvailable').checked };
    if (!payload.category_id) throw new Error('Choose a category for this food item.');
    if ($('foodPrice').value.trim() === '' || !Number.isFinite(payload.price) || payload.price < 0) throw new Error('Enter a valid price.');
    if (!payload.name) throw new Error('Enter a name for this food item.');
    if (uploadedUrl) payload.image_url = uploadedUrl;
    if (id) { const { error } = await db.from('food_items').update(payload).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('food_items').insert(payload); if (error) throw error; }
    await loadFoods(); renderFoodGrid(); renderCategoryList(); $('foodFormPanel').classList.add('hidden'); showMessage(id ? 'Food item updated.' : 'Food item added.');
  } catch (e) { setFormMessage('foodFormMessage', e.message, true); }
  finally { setBusy(button, false); }
});
$('categoryForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('categoryForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('categoryFormMessage', '');
  try {
    const id = $('categoryId').value; const file = $('categoryImage').files[0]; const uploadedUrl = file ? await uploadImage(file, 'categories') : null;
    const payload = { name: $('categoryName').value.trim(), slug: ($('categorySlug').value.trim() || slugify($('categoryName').value)).toLowerCase(), description: $('categoryDescription').value.trim() || null, sort_order: Number($('categorySort').value || 0), is_active: $('categoryActive').checked };
    if (uploadedUrl) payload.image_url = uploadedUrl;
    if (id) { const { error } = await db.from('categories').update(payload).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('categories').insert(payload); if (error) throw error; }
    await loadCategories(); populateCategorySelects(); renderCategoryList(); renderSubcategoryList(); $('categoryFormPanel').classList.add('hidden'); showMessage(id ? 'Category updated.' : 'Category added.');
  } catch (e) { setFormMessage('categoryFormMessage', e.message, true); }
  finally { setBusy(button, false); }
});


$('subcategoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const button = $('subcategoryForm').querySelector('button[type=submit]');
  setBusy(button, true, 'Saving…');
  setFormMessage('subcategoryFormMessage', '');

  try {
    const id = $('subcategoryId').value;
    const file = $('subcategoryImage').files[0];

    const uploadedUrl = file
      ? await uploadImage(file, 'subcategories')
      : null;

    const payload = {
      category_id: $('subcategoryCategory').value,
      name: $('subcategoryName').value.trim(),
      sort_order: Number($('subcategorySort').value || 0),
      is_active: $('subcategoryActive').checked
    };

    if (!payload.category_id) {
      throw new Error('Choose a parent category.');
    }

    if (!payload.name) {
      throw new Error('Enter a subcategory name.');
    }

    if (uploadedUrl) {
      payload.image_url = uploadedUrl;
    }

    if (id) {
      const { error } = await db
        .from('subcategories')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

    } else {
      const { error } = await db
        .from('subcategories')
        .insert(payload);

      if (error) throw error;
    }

    await loadCategories();

    populateCategorySelects();

    renderSubcategoryList();

    renderFoodGrid();

    $('subcategoryFormPanel').classList.add('hidden');

    showMessage(
      id ? 'Subcategory updated successfully.' : 'Subcategory added successfully.'
    );

  } catch (e) {
    setFormMessage('subcategoryFormMessage', e.message, true);

  } finally {
    setBusy(button, false);
  }
});



$('galleryForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('galleryForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('galleryFormMessage', '');
  try {
    const id = $('galleryId').value; const file = $('galleryImage').files[0]; const uploadedUrl = file ? await uploadImage(file, 'gallery') : null;
    const existing = state.gallery.find(g => g.id === id);
    if (!id && !uploadedUrl) throw new Error('Choose an image for the new gallery entry.');
    const payload = { title: $('galleryTitle').value.trim() || null, description: $('galleryDescription').value.trim() || null, image_type: $('galleryType').value, sort_order: Number($('gallerySort').value || 0), is_active: $('galleryActive').checked };
    if (uploadedUrl) payload.image_url = uploadedUrl;
    else if (existing?.image_url) payload.image_url = existing.image_url;
    if (id) { const { error } = await db.from('gallery_images').update(payload).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('gallery_images').insert(payload); if (error) throw error; }
    await loadGallery(); $('galleryFormPanel').classList.add('hidden'); showMessage(id ? 'Gallery image updated.' : 'Gallery image added.');
  } catch (e) { setFormMessage('galleryFormMessage', e.message, true); }
  finally { setBusy(button, false); }
});
$('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('settingsForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('settingsMessage', '');
  try {
    const payload = {
      cafe_name: $('settingCafeName').value.trim(), phone: $('settingPhone').value.trim() || null,
      alternate_phone: $('settingAlternatePhone').value.trim() || null, email: $('settingEmail').value.trim() || null,
      address: $('settingAddress').value.trim() || null, maps_url: $('settingMaps').value.trim() || null,
      opening_hours: $('settingHours').value.trim() || null, weekly_holidays: $('settingHolidays').value.trim() || null,
      social_links: { ...(state.settings?.social_links || {}), instagram: $('settingInstagram').value.trim() || null, facebook: $('settingFacebook').value.trim() || null }
    };
    const logo = $('settingLogo').files[0]; const desktop = $('settingDesktopBanner').files[0]; const mobile = $('settingMobileBanner').files[0];
    if (logo) payload.logo_url = await uploadImage(logo, 'settings');
    if (desktop) payload.homepage_banner_url = await uploadImage(desktop, 'settings');
    if (mobile) payload.mobile_banner_url = await uploadImage(mobile, 'settings');
    let result;
    if (state.settings?.id !== undefined && state.settings?.id !== null) {
      result = await db.from('cafe_settings').update(payload).eq('id', state.settings.id).select('id');
    } else {
      result = await db.from('cafe_settings').insert({ id: true, ...payload }).select('id');
    }
    if (result.error) throw result.error;
    if (!result.data || !result.data.length) throw new Error('Settings were not saved. Check that this account is allowed to edit cafe_settings.');
    await loadSettings(); setFormMessage('settingsMessage', 'Cafe settings saved successfully.'); showMessage('Cafe settings saved.');
  } catch (e) { setFormMessage('settingsMessage', e.message, true); }
  finally { setBusy(button, false); }
});
document.querySelectorAll('[data-theme-preset]').forEach(button => button.addEventListener('click', () => {
  const preset = themePresets[button.dataset.themePreset];
  if (!preset) return;
  state.themeSettings = { ...preset };
  populateThemeEditor();
}));
document.querySelectorAll('#themeForm input[type=color]').forEach(input => input.addEventListener('input', () => { state.themeSettings.name = 'custom'; renderThemePreview(readThemeInputs()); document.querySelectorAll('[data-theme-preset]').forEach(b => b.classList.remove('selected')); }));
$('themeForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('themeForm').querySelector('button[type=submit]'); setBusy(button, true, 'Publishing…'); setFormMessage('themeMessage', '');
  try {
    const theme = readThemeInputs();
    const { block } = themeProblems(theme);
    if (block.length) throw new Error(block[0]);
    const targetId = state.settings?.id ?? true;
    let result = await db.from('cafe_settings').update({ theme_settings: theme }).eq('id', targetId).select('id');
    if (result.error) throw result.error;
    if (!result.data || !result.data.length) {
      result = await db.from('cafe_settings').insert({ id: true, theme_settings: theme }).select('id');
      if (result.error) throw result.error;
      if (!result.data || !result.data.length) throw new Error('The theme was not saved. Check that this account is allowed to edit cafe_settings.');
      state.settings = { ...(state.settings || {}), id: true };
    }
    state.themeSettings = theme;
    state.settings.theme_settings = theme;
    document.querySelectorAll('[data-theme-preset]').forEach(b => b.classList.toggle('selected', b.dataset.themePreset === theme.name));
    setFormMessage('themeMessage', 'Website theme published. The customer website will use it the next time it is opened or refreshed.');
    showMessage('Customer website theme published.');
  } catch (e) { setFormMessage('themeMessage', `${e.message} (If this mentions theme_settings, run add-theme-settings.sql in Supabase first.)`, true); }
  finally { setBusy(button, false); }
});
$('resetThemeBtn').addEventListener('click', () => { state.themeSettings = { ...themeDefaults }; populateThemeEditor(); setFormMessage('themeMessage', 'Preview reset to the original Forest Cafe theme. Publish to apply it to the customer website.'); });


/* =========================================================
   COUPONS AND DELIVERY SETTINGS
   ========================================================= */

let couponRows = [];

function localDateTimeValue(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = n => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadCoupons() {
  await loadSettings();
  const { data, error } = await db
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  couponRows = data || [];
  renderCoupons();

  const delivery = state.settings?.delivery_settings || {
    mode: 'free',
    flat_fee: 0
  };

  $('deliveryMode').value =
    delivery.mode === 'flat_fee' ? 'flat_fee' : 'free';

  $('deliveryFlatFee').value = Number(delivery.flat_fee || 0);
}

function renderCoupons() {
  $('couponsList').innerHTML = couponRows.length
    ? couponRows.map(c => `
      <article class="category-row">
        <div class="category-info">
          <strong>${escapeHtml(c.code)}</strong>
          <small>
            ${c.discount_type === 'percentage'
              ? `${Number(c.discount_value)}% off`
              : `${money(c.discount_value)} off`}
            · Minimum order: ${money(c.minimum_order_amount)}
            · Used: ${Number(c.usage_count)}
            ${c.usage_limit ? `/ ${Number(c.usage_limit)}` : ''}
            · ${c.is_active ? 'Active' : 'Inactive'}
          </small>
          <small>
            Expires: ${c.expires_at ? escapeHtml(dateText(c.expires_at)) : 'No expiry'}
          </small>
        </div>
        <button class="small-btn" data-edit-coupon="${c.id}">Edit</button>
        <button class="small-btn" data-toggle-coupon="${c.id}">
          ${c.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button class="small-btn" data-delete-coupon="${c.id}">Delete</button>
      </article>
    `).join('')
    : '<p class="empty-state">No coupons added yet.</p>';
}

function resetCouponForm() {
  $('couponForm').reset();
  $('couponId').value = '';
  $('couponFormTitle').textContent = 'Add coupon';
  $('couponActive').checked = true;
  setFormMessage('couponFormMessage', '');
}

function editCoupon(coupon) {
  $('couponId').value = coupon.id;
  $('couponCode').value = coupon.code;
  $('couponType').value = coupon.discount_type;
  $('couponValue').value = coupon.discount_value;
  $('couponMinimum').value = coupon.minimum_order_amount;
  $('couponMaximum').value = coupon.max_discount_amount ?? '';
  $('couponStarts').value = localDateTimeValue(coupon.starts_at);
  $('couponExpires').value = localDateTimeValue(coupon.expires_at);
  $('couponLimit').value = coupon.usage_limit ?? '';
  $('couponActive').checked = coupon.is_active;
  $('couponFormTitle').textContent = 'Edit coupon';
  setFormMessage('couponFormMessage', '');
  $('couponForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('couponForm').addEventListener('submit', async event => {
  event.preventDefault();

  const button = $('couponForm').querySelector('button[type=submit]');
  setBusy(button, true, 'Saving…');
  setFormMessage('couponFormMessage', '');

  try {
    const id = $('couponId').value;
    const code = $('couponCode').value.trim().toUpperCase();
    const type = $('couponType').value;
    const value = Number($('couponValue').value);
    const minimum = Number($('couponMinimum').value || 0);
    const maximumText = $('couponMaximum').value.trim();
    const limitText = $('couponLimit').value.trim();

    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      throw new Error('Coupon code must be 3–40 letters, numbers, _ or -.');
    }

    if (!Number.isFinite(value) || value <= 0 || (type === 'percentage' && value > 100)) {
      throw new Error('Enter a valid discount value.');
    }

    if (!Number.isFinite(minimum) || minimum < 0) {
      throw new Error('Enter a valid minimum order amount.');
    }

    const maximum = maximumText === '' ? null : Number(maximumText);
    const limit = limitText === '' ? null : Number(limitText);

    if (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0)) {
      throw new Error('Maximum discount must be greater than zero.');
    }

    if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error('Usage limit must be a whole number greater than zero.');
    }

    const startsValue = $('couponStarts').value;
    const expiresValue = $('couponExpires').value;

    const startsAt = startsValue
      ? new Date(startsValue).toISOString()
      : new Date().toISOString();

    const expiresAt = expiresValue
      ? new Date(expiresValue).toISOString()
      : null;

    if (expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      throw new Error('Expiry must be after the start date.');
    }

    const payload = {
      code,
      discount_type: type,
      discount_value: value,
      minimum_order_amount: minimum,
      max_discount_amount: maximum,
      starts_at: startsAt,
      expires_at: expiresAt,
      usage_limit: limit,
      is_active: $('couponActive').checked
    };

    const result = id
      ? await db.from('coupons').update(payload).eq('id', id)
      : await db.from('coupons').insert(payload);

    if (result.error) throw result.error;

    await loadCoupons();
    resetCouponForm();
    showMessage(id ? 'Coupon updated.' : 'Coupon created.');

  } catch (error) {
    setFormMessage('couponFormMessage', error.message, true);
  } finally {
    setBusy(button, false);
  }
});

$('couponsList').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit-coupon]');
  const toggleButton = event.target.closest('[data-toggle-coupon]');
  const deleteButton = event.target.closest('[data-delete-coupon]');

  if (editButton) {
    const coupon = couponRows.find(c => c.id === editButton.dataset.editCoupon);
    if (coupon) editCoupon(coupon);
    return;
  }

  if (toggleButton) {
    const coupon = couponRows.find(c => c.id === toggleButton.dataset.toggleCoupon);
    if (!coupon) return;

    toggleButton.disabled = true;

    try {
      const { error } = await db.from('coupons')
        .update({ is_active: !coupon.is_active })
        .eq('id', coupon.id);

      if (error) throw error;

      await loadCoupons();
      showMessage('Coupon status updated.');
    } catch (error) {
      showMessage(error.message, true);
    }

    return;
  }

  if (deleteButton) {
    const coupon = couponRows.find(c => c.id === deleteButton.dataset.deleteCoupon);
    if (!coupon) return;

    if (Number(coupon.usage_count) > 0) {
      showMessage('This coupon has been used. Deactivate it instead of deleting it.', true);
      return;
    }

    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;

    deleteButton.disabled = true;

    try {
      const { error } = await db.from('coupons')
        .delete()
        .eq('id', coupon.id);

      if (error) throw error;

      await loadCoupons();
      showMessage('Coupon deleted.');
    } catch (error) {
      showMessage(error.message, true);
    }
  }
});

$('resetCouponForm').addEventListener('click', resetCouponForm);
$('cancelCouponEdit').addEventListener('click', resetCouponForm);

$('refreshCoupons').addEventListener('click', () => {
  loadCoupons()
    .then(() => showMessage('Coupons refreshed.'))
    .catch(error => showMessage(error.message, true));
});

$('deliverySettingsForm').addEventListener('submit', async event => {
  event.preventDefault();

  const button = $('deliverySettingsForm').querySelector('button[type=submit]');
  setBusy(button, true, 'Saving…');
  setFormMessage('deliveryMessage', '');

  try {
    const mode = $('deliveryMode').value;
    const flatFee = Number($('deliveryFlatFee').value || 0);

    if (!Number.isFinite(flatFee) || flatFee < 0) {
      throw new Error('Enter a valid delivery charge.');
    }

    const deliverySettings = {
      mode,
      flat_fee: mode === 'flat_fee' ? flatFee : 0,
      free_above_amount: null,
      distance_rules: [],
      area_rules: []
    };

    const targetId = state.settings?.id ?? true;

    let result = await db.from('cafe_settings')
      .update({ delivery_settings: deliverySettings })
      .eq('id', targetId)
      .select('id');

    if (result.error) throw result.error;

    if (!result.data || !result.data.length) {
      result = await db.from('cafe_settings')
        .insert({ id: true, delivery_settings: deliverySettings })
        .select('id');

      if (result.error) throw result.error;
      if (!result.data || !result.data.length) {
        throw new Error('Delivery settings were not saved.');
      }
    }

    state.settings = {
      ...(state.settings || {}),
      id: targetId,
      delivery_settings: deliverySettings
    };

    setFormMessage('deliveryMessage', 'Delivery settings saved.');
    showMessage('Delivery settings saved.');

  } catch (error) {
    setFormMessage('deliveryMessage', error.message, true);
  } finally {
    setBusy(button, false);
  }
});


db.auth.onAuthStateChange((event, session) => {

    if (event === 'PASSWORD_RECOVERY') {

        isPasswordRecovery = true;

        $('loginView').classList.add('hidden');
        $('appView').classList.add('hidden');
        $('passwordRecoveryView').classList.remove('hidden');

        return;
    }

    if (event === 'SIGNED_OUT') {

        isPasswordRecovery = false;

        clearAdminData();

        $('passwordRecoveryView').classList.add('hidden');
    }

});

async function init() {
    const linkParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (linkParams.get('error_description')) {
        setFormMessage('loginMessage', linkParams.get('error_description') + ' Please request a new link.', true);
        history.replaceState(null, '', window.location.pathname);
    }
    try {
        const { data: { session }, error } = await db.auth.getSession();

        if (error) throw error;

        if (session?.user && !isPasswordRecovery) {
            try {
                await startApp(session.user);
            } catch (e) {
                await db.auth.signOut();
                clearAdminData();
                setFormMessage('loginMessage', e.message, true);
            }
        } else if (!isPasswordRecovery) {
            clearAdminData();
        }

    } catch (e) {
        if (!isPasswordRecovery) {
            clearAdminData();
            setFormMessage('loginMessage', e.message, true);
        }
    }
}

init();