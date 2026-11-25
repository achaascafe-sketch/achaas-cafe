'use strict';

// The publishable key is intended for browser use. Never put a service-role or secret key here.
const SUPABASE_URL = 'https://rizspsoqtfyedmfbvram.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ySrgm-yvh15E3AnXyEU9Ag_TjBHaHD1';
const IMAGE_BUCKET = 'cafe-images';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = {
  user: null, admin: null, orders: [], todayOrders: [], orderItems: [],
  categories: [], subcategories: [], foods: [], gallery: [], settings: null,
  reportOrders: [], themeSettings: {}, currentView: 'overview'
};
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—';
const statusOptions = ['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
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
}
async function loadAllData() {
  await Promise.all([loadCategories(), loadFoods(), loadOrders(), loadTodayOrders()]);
  renderOverview();
  renderOrders();
  renderFoodGrid();
  renderCategoryList();
  renderSubcategoryList();
  populateCategorySelects();
}
async function loadCategories() {
  const [catResult, subResult] = await Promise.all([
    db.from('categories').select('id,name,slug,description,image_url,sort_order,is_active').order('sort_order', { ascending: true }),
    db.from('subcategories').select('id,category_id,name,image_url,sort_order,is_active').order('sort_order', { ascending: true })
  ]);
  if (catResult.error) throw catResult.error;
  if (subResult.error) throw subResult.error;
  state.categories = catResult.data || [];
  state.subcategories = subResult.data || [];
}
async function loadFoods() {
  const { data, error } = await db.from('food_items').select('id,category_id,subcategory_id,name,description,price,image_url,is_available,sort_order').order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  state.foods = data || [];
}
async function loadOrders() {
  const { data, error } = await db.from('orders').select('id,order_number,customer_id,customer_name_snapshot,customer_phone_snapshot,delivery_address_snapshot,food_preferences,special_instructions,total_amount,status,cancellation_reason,created_at,updated_at').order('created_at', { ascending: false }).limit(150);
  if (error) throw error;
  state.orders = data || [];
  const ids = state.orders.map(o => o.id);
  if (!ids.length) { state.orderItems = []; return; }
  const itemsResult = await db.from('order_items').select('id,order_id,food_item_id,food_name_snapshot,quantity,unit_price_at_order,subtotal').in('order_id', ids);
  if (itemsResult.error) throw itemsResult.error;
  state.orderItems = itemsResult.data || [];
}
async function loadTodayOrders() {
  const bounds = indiaDayBounds();
  const { data, error } = await db.from('orders')
    .select('id,total_amount,status,created_at')
    .gte('created_at', bounds.start)
    .lt('created_at', bounds.end)
    .order('created_at', { ascending: false })
    .range(0, 4999);
  if (error) throw error;
  state.todayOrders = data || [];
}
function renderOverview() {
  const orders = state.orders;
  const today = state.todayOrders;
  const pendingToday = today.filter(o => ['received', 'accepted', 'preparing', 'ready'].includes(o.status)).length;
  $('statTodayOrders').textContent = today.length;
  $('statTodayValue').textContent = money(currencySum(today, o => o.status !== 'cancelled'));
  $('statTodaySales').textContent = money(currencySum(today, o => o.status === 'completed'));
  $('statTodayPending').textContent = pendingToday;
  $('statTodayCancelled').textContent = today.filter(o => o.status === 'cancelled').length;
  $('statOrders').textContent = orders.length;
  $('statNew').textContent = orders.filter(o => o.status === 'received').length;
  $('statCompleted').textContent = orders.filter(o => o.status === 'completed').length;
  $('statSales').textContent = money(currencySum(orders, o => o.status === 'completed'));
  const recent = orders.slice(0, 6);
  $('recentOrders').innerHTML = recent.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>${recent.map(o => `<tr><td>#${escapeHtml(o.order_number)}</td><td>${escapeHtml(o.customer_name_snapshot)}</td><td>${escapeHtml(dateText(o.created_at))}</td><td>${money(o.total_amount)}</td><td><span class="pill ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="empty-state">No orders have been received yet.</p>';
  const newCount = orders.filter(o => o.status === 'received').length;
  $('newOrderBadge').textContent = newCount;
  $('newOrderBadge').classList.toggle('hidden', newCount === 0);
}
function renderOrders() {
  const search = ($('orderSearch')?.value || '').trim().toLowerCase();
  const filter = $('orderStatusFilter')?.value || 'all';
  const orders = state.orders.filter(o => {
    const matchesStatus = filter === 'all' || o.status === filter;
    const haystack = [o.order_number, o.customer_name_snapshot, o.customer_phone_snapshot].join(' ').toLowerCase();
    return matchesStatus && haystack.includes(search);
  });
  $('ordersList').innerHTML = orders.length ? orders.map(o => {
    const items = state.orderItems.filter(i => i.order_id === o.id);
    const itemText = items.map(i => `${escapeHtml(i.food_name_snapshot)} × ${Number(i.quantity)} (${money(i.subtotal ?? Number(i.unit_price_at_order) * Number(i.quantity))})`).join('<br>') || 'No item details found';
    const options = statusOptions.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('');
    return `<article class="order-card"><div class="order-top"><div><h3>Order #${escapeHtml(o.order_number)}</h3><div class="order-meta">${escapeHtml(dateText(o.created_at))} · ${escapeHtml(o.customer_name_snapshot)}</div></div><span class="pill ${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></div><div class="order-details"><div><strong>Customer details</strong><p>${escapeHtml(o.customer_name_snapshot)}<br>${escapeHtml(o.customer_phone_snapshot)}<br>${escapeHtml(o.delivery_address_snapshot)}</p>${o.food_preferences ? `<p><b>Preferences:</b> ${escapeHtml(Array.isArray(o.food_preferences) ? o.food_preferences.join(', ') : o.food_preferences)}</p>` : ''}${o.special_instructions ? `<p><b>Instructions:</b> ${escapeHtml(o.special_instructions)}</p>` : ''}</div><div><strong>Order items</strong><p class="order-items">${itemText}</p><strong>Total: ${money(o.total_amount)}</strong>${o.cancellation_reason ? `<p><b>Cancellation reason:</b> ${escapeHtml(o.cancellation_reason)}</p>` : ''}</div></div><div class="order-actions"><label class="muted" for="status-${o.id}">Update status</label><select id="status-${o.id}" aria-label="Update order status">${options}</select><button class="primary-btn" data-save-status="${o.id}">Save status</button></div></article>`;
  }).join('') : '<p class="empty-state">No orders match this filter.</p>';
}
function renderFoodGrid() {
  const search = ($('foodSearch')?.value || '').trim().toLowerCase();
  const cat = $('foodCategoryFilter')?.value || 'all';
  const foods = state.foods.filter(f => (cat === 'all' || f.category_id === cat) && `${f.name} ${f.description || ''}`.toLowerCase().includes(search));
  $('foodGrid').innerHTML = foods.length ? foods.map(f => {
    const category = state.categories.find(c => c.id === f.category_id)?.name || 'Uncategorised';
    const image = f.image_url || '';
    return `<article class="food-card">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(f.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="food-card-body"><h3>${escapeHtml(f.name)}</h3><p>${escapeHtml(category)} · ${f.is_available ? 'Available' : 'Unavailable'}</p><div class="price">${money(f.price)}</div><div class="food-card-actions"><button class="small-btn" data-edit-food="${f.id}">Edit</button><button class="small-btn" data-toggle-food="${f.id}">${f.is_available ? 'Mark unavailable' : 'Make available'}</button></div></div></article>`;
  }).join('') : '<p class="empty-state">No food items found.</p>';
}
function renderCategoryList() {
  $('categoryList').innerHTML = state.categories.length ? state.categories.map(c => `<article class="category-row">${c.image_url ? `<img src="${escapeHtml(c.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="category-info"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.slug)} · ${c.is_active ? 'Active' : 'Inactive'} · ${state.foods.filter(f => f.category_id === c.id).length} food items</small></div><button class="small-btn" data-edit-category="${c.id}">Edit</button><button class="small-btn" data-toggle-category="${c.id}">${c.is_active ? 'Deactivate' : 'Activate'}</button></article>`).join('') : '<p class="empty-state">No categories found.</p>';
}
function renderSubcategoryList() {
  $('subcategoryList').innerHTML = state.subcategories.length ? state.subcategories.map(s => {
    const categoryName = state.categories.find(c => c.id === s.category_id)?.name || 'Unknown category';
    const assignedCount = state.foods.filter(f => f.subcategory_id === s.id).length;
    return `<article class="category-row">${s.image_url ? `<img src="${escapeHtml(s.image_url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="category-info"><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(categoryName)} · ${s.is_active ? 'Active' : 'Inactive'} · ${assignedCount} food items</small></div><button class="small-btn" data-edit-subcategory="${s.id}">Edit</button><button class="small-btn" data-toggle-subcategory="${s.id}">${s.is_active ? 'Deactivate' : 'Activate'}</button></article>`;
  }).join('') : '<p class="empty-state">No subcategories found. Add one to organise your menu.</p>';
}
function renderGallery() {
  $('galleryGrid').innerHTML = state.gallery.length ? state.gallery.map(g => `<article class="food-card">${g.image_url ? `<img src="${escapeHtml(g.image_url)}" alt="${escapeHtml(g.title || 'Cafe gallery image')}" loading="lazy" onerror="this.style.display='none'">` : ''}<div class="food-card-body"><h3>${escapeHtml(g.title || 'Untitled image')}</h3><p>${escapeHtml(g.image_type || 'general')} · ${g.is_active ? 'Visible' : 'Hidden'}</p><p>${escapeHtml(g.description || '')}</p><div class="food-card-actions"><button class="small-btn" data-edit-gallery="${g.id}">Edit</button><button class="small-btn" data-toggle-gallery="${g.id}">${g.is_active ? 'Hide' : 'Show'}</button></div></div></article>`).join('') : '<p class="empty-state">No gallery images found.</p>';
}
function populateCategorySelects() {
  const allOptions = state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const activeOptions = state.categories.filter(c => c.is_active).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  $('foodCategory').innerHTML = activeOptions || '<option value="">No active categories</option>';
  $('foodCategoryFilter').innerHTML = '<option value="all">All categories</option>' + allOptions;
  $('subcategoryCategory').innerHTML = activeOptions || '<option value="">No active categories</option>';
  updateSubcategoryOptions();
}
function updateSubcategoryOptions() {
  const catId = $('foodCategory').value;
  const subs = state.subcategories.filter(s => s.category_id === catId && s.is_active);
  $('foodSubcategory').innerHTML = '<option value="">No subcategory</option>' + subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}
function switchView(name, updateHistory = true) {
  const validViews = ['overview', 'orders', 'menu', 'categories', 'subcategories', 'gallery', 'settings', 'appearance', 'reports'];
  if (!validViews.includes(name)) name = 'overview';
  state.currentView = name;
  document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
  $(`${name}View`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const titles = { overview: 'Overview', orders: 'Orders', menu: 'Food items', categories: 'Categories', subcategories: 'Subcategories', gallery: 'Gallery', settings: 'Cafe settings', appearance: 'Website appearance', reports: 'Sales reports' };
  $('pageTitle').textContent = titles[name] || 'Dashboard';
  if (updateHistory) {
    const url = new URL(window.location.href);
    url.hash = name;
    if (window.location.hash !== `#${name}`) history.pushState({ adminView: name }, '', url);
  }
  if (name === 'gallery') loadGallery().catch(e => showMessage(e.message, true));
  if (name === 'settings' || name === 'appearance') loadSettings().then(() => { if (name === 'appearance') populateThemeEditor(); }).catch(e => showMessage(e.message, true));
  if (name === 'reports') loadReports().catch(e => showMessage(e.message, true));
}
async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 6 * 1024 * 1024) throw new Error('Image must be 6 MB or smaller.');
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
function openFoodForm(food = null) {
  $('foodForm').reset(); $('foodId').value = food?.id || '';
  $('foodFormTitle').textContent = food ? 'Edit food item' : 'Add food item';
  $('foodName').value = food?.name || ''; $('foodPrice').value = food?.price ?? '';
  $('foodDescription').value = food?.description || ''; $('foodAvailable').checked = food?.is_available ?? true;
  if (food?.category_id) $('foodCategory').value = food.category_id;
  updateSubcategoryOptions(); $('foodSubcategory').value = food?.subcategory_id || '';
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
  const { data, error } = await db.from('orders')
    .select('id,total_amount,status,created_at')
    .gte('created_at', start)
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .range(0, 4999);
  if (error) throw error;
  state.reportOrders = data || [];
  renderReports(days, firstKey, todayKey);
}
function renderReports(days, firstKey, todayKey) {
  const rows = state.reportOrders;
  const completed = rows.filter(o => o.status === 'completed');
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
  const maxValue = Math.max(1, ...entries.map(([, value]) => value));
  const displayEntries = days > 30 ? entries.filter((_, index) => index % 3 === 0 || index === entries.length - 1) : entries;
  $('salesBars').innerHTML = displayEntries.map(([day, value]) => {
    const percent = value > 0 ? Math.max(2, value / maxValue * 100) : 0;
    return `<div class="sales-bar-row"><span>${escapeHtml(day.slice(5))}</span><div class="sales-bar-track"><div class="sales-bar-fill" style="width:${percent}%"></div></div><span class="sales-bar-value">${money(value)}</span></div>`;
  }).join('') || '<p class="empty-state">No completed sales in this period.</p>';
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
function clearAdminData() {
  // Clear sensitive and cached dashboard data
  state.user = null;
  state.admin = null;
  state.orders = [];
  state.orderItems = [];
  state.categories = [];
  state.subcategories = [];
  state.foods = [];
  state.currentView = 'overview';

  // Clear customer and order information from the page
  $('ordersList').innerHTML = '';
  $('recentOrders').innerHTML = '';
  $('ownerName').textContent = '';
  $('statOrders').textContent = '0';
  $('statNew').textContent = '0';
  $('statCompleted').textContent = '0';
  $('statSales').textContent = money(0);
  $('newOrderBadge').textContent = '0';

  // Hide dashboard and show login
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
$('foodCategory').addEventListener('change', updateSubcategoryOptions);
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
  const button = event.target.closest('[data-save-status]'); if (!button) return;
  const id = button.dataset.saveStatus; const status = $(`status-${id}`).value;
  setBusy(button, true, 'Saving…');
  try {
    const { error } = await db.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
    await Promise.all([loadOrders(), loadTodayOrders()]);
    renderOrders(); renderOverview(); showMessage(`Order status updated to ${status}.`);
  } catch (e) { showMessage(e.message, true); }
  finally { setBusy(button, false); }
});
$('foodGrid').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-food]'); const toggle = event.target.closest('[data-toggle-food]');
  if (edit) { const food = state.foods.find(f => f.id === edit.dataset.editFood); if (food) openFoodForm(food); }
  if (toggle) {
    const food = state.foods.find(f => f.id === toggle.dataset.toggleFood); if (!food) return;
    toggle.disabled = true;
    try { const { error } = await db.from('food_items').update({ is_available: !food.is_available }).eq('id', food.id); if (error) throw error; await loadFoods(); renderFoodGrid(); showMessage('Food availability updated.'); }
    catch (e) { showMessage(e.message, true); } finally { toggle.disabled = false; }
  }
});
$('categoryList').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-category]'); const toggle = event.target.closest('[data-toggle-category]');
  if (edit) { const category = state.categories.find(c => c.id === edit.dataset.editCategory); if (category) openCategoryForm(category); }
  if (toggle) {
    const category = state.categories.find(c => c.id === toggle.dataset.toggleCategory); if (!category) return;
    const hasActiveFood = state.foods.some(f => f.category_id === category.id && f.is_available);
    if (category.is_active && hasActiveFood && !confirm('This category has available food items. Deactivating it will hide them from customers. Continue?')) return;
    toggle.disabled = true;
    try { const { error } = await db.from('categories').update({ is_active: !category.is_active }).eq('id', category.id); if (error) throw error; await loadCategories(); renderCategoryList(); renderSubcategoryList(); populateCategorySelects(); showMessage('Category status updated.'); }
    catch (e) { showMessage(e.message, true); } finally { toggle.disabled = false; }
  }
});
$('subcategoryList').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-subcategory]'); const toggle = event.target.closest('[data-toggle-subcategory]');
  if (edit) { const sub = state.subcategories.find(s => s.id === edit.dataset.editSubcategory); if (sub) openSubcategoryForm(sub); }
  if (toggle) {
    const sub = state.subcategories.find(s => s.id === toggle.dataset.toggleSubcategory); if (!sub) return;
    const inUse = state.foods.some(f => f.subcategory_id === sub.id);
    if (sub.is_active && inUse && !confirm('Food items use this subcategory. Deactivating it may hide those items from customers. Continue?')) return;
    toggle.disabled = true;
    try { const { error } = await db.from('subcategories').update({ is_active: !sub.is_active }).eq('id', sub.id); if (error) throw error; await loadCategories(); renderSubcategoryList(); populateCategorySelects(); showMessage('Subcategory status updated.'); }
    catch (e) { showMessage(e.message, true); } finally { toggle.disabled = false; }
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

$('foodForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('foodForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('foodFormMessage', '');
  try {
    const id = $('foodId').value;
    const file = $('foodImage').files[0]; const uploadedUrl = file ? await uploadImage(file, 'food-items') : null;
    const payload = { name: $('foodName').value.trim(), category_id: $('foodCategory').value, subcategory_id: $('foodSubcategory').value || null, description: $('foodDescription').value.trim() || null, price: Number($('foodPrice').value), is_available: $('foodAvailable').checked };
    if (!payload.category_id) throw new Error('Choose a category for this food item.');
    if (!Number.isFinite(payload.price) || payload.price < 0) throw new Error('Enter a valid price.');
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
    const payload = { name: $('categoryName').value.trim(), slug: $('categorySlug').value.trim().toLowerCase(), description: $('categoryDescription').value.trim() || null, sort_order: Number($('categorySort').value || 0), is_active: $('categoryActive').checked };
    if (uploadedUrl) payload.image_url = uploadedUrl;
    if (id) { const { error } = await db.from('categories').update(payload).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('categories').insert(payload); if (error) throw error; }
    await loadCategories(); populateCategorySelects(); renderCategoryList(); renderSubcategoryList(); $('categoryFormPanel').classList.add('hidden'); showMessage(id ? 'Category updated.' : 'Category added.');
  } catch (e) { setFormMessage('categoryFormMessage', e.message, true); }
  finally { setBusy(button, false); }
});
$('subcategoryForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('subcategoryForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('subcategoryFormMessage', '');
  try {
    const id = $('subcategoryId').value; const file = $('subcategoryImage').files[0]; const uploadedUrl = file ? await uploadImage(file, 'subcategories') : null;
    const payload = { category_id: $('subcategoryCategory').value, name: $('subcategoryName').value.trim(), sort_order: Number($('subcategorySort').value || 0), is_active: $('subcategoryActive').checked };
    if (!payload.category_id) throw new Error('Choose a parent category.');
    if (uploadedUrl) payload.image_url = uploadedUrl;
    if (id) { const { error } = await db.from('subcategories').update(payload).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('subcategories').insert(payload); if (error) throw error; }
    await loadCategories(); populateCategorySelects(); renderSubcategoryList(); $('subcategoryFormPanel').classList.add('hidden'); showMessage(id ? 'Subcategory updated.' : 'Subcategory added.');
  } catch (e) { setFormMessage('subcategoryFormMessage', e.message, true); }
  finally { setBusy(button, false); }
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
      result = await db.from('cafe_settings').update(payload).eq('id', state.settings.id);
    } else {
      result = await db.from('cafe_settings').insert({ id: true, ...payload });
    }
    if (result.error) throw result.error;
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
  event.preventDefault(); const button = $('themeForm').querySelector('button[type=submit]'); setBusy(button, true, 'Saving…'); setFormMessage('themeMessage', '');
  try {
    const theme = readThemeInputs();
    const { error } = await db.from('cafe_settings').update({ theme_settings: theme }).eq('id', state.settings?.id ?? true);
    if (error) throw error;
    state.themeSettings = theme;
    if (state.settings) state.settings.theme_settings = theme;
    document.querySelectorAll('[data-theme-preset]').forEach(b => b.classList.toggle('selected', b.dataset.themePreset === theme.name));
    setFormMessage('themeMessage', 'Website theme published. The full customer-facing website will use it when refreshed.');
    showMessage('Customer website theme published.');
  } catch (e) { setFormMessage('themeMessage', `${e.message} Make sure the theme_settings database column has been added.`, true); }
  finally { setBusy(button, false); }
});
$('resetThemeBtn').addEventListener('click', () => { state.themeSettings = { ...themeDefaults }; populateThemeEditor(); setFormMessage('themeMessage', 'Preview reset to the original Forest Cafe theme. Publish to apply it to the customer website.'); });
async function init() {
  try {
    const { data: { session }, error } = await db.auth.getSession();

    if (error) throw error;

    if (session?.user) {
      try {
        await startApp(session.user);
      } catch (e) {
        await db.auth.signOut();
        clearAdminData();
        setFormMessage('loginMessage', e.message, true);
      }
    } else {
      clearAdminData();
    }

  } catch (e) {
    clearAdminData();
    setFormMessage('loginMessage', e.message, true);
  }

  db.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      clearAdminData();
    }
  });
}

init();