
"use strict";

/* =========================================================
   SUPABASE CONNECTION
   ========================================================= */

const SUPABASE_URL = "https://rizspsoqtfyedmfbvram.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ySrgm-yvh15E3AnXyEU9Ag_TjBHaHD1";
const ORDER_FUNCTION_URL = SUPABASE_URL + "/functions/v1/smooth-function";

const supabaseClient = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;


/* =========================================================
   GLOBAL CUSTOMER WEBSITE THEME
   Theme is published by the owner in the admin dashboard.
   Only public cafe_settings.theme_settings is read here.
   No secret/service-role key is used in the customer browser.
   ========================================================= */

const DEFAULT_WEBSITE_THEME = {
    name: "forest",
    primary: "#142a20",
    background: "#142a20",
    surface: "#1d392b",
    text: "#f8efd9",
    muted: "#b9c4b8",
    accent: "#d8ad76"
};

function validThemeColour(value, fallback) {
    return (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value))
        ? value
        : fallback;
}

function hexToRgbParts(hex) {
    const safe = validThemeColour(hex, "#000000").slice(1);
    return [0, 2, 4].map(index => parseInt(safe.slice(index, index + 2), 16));
}

function rgbToHex(parts) {
    return "#" + parts.map(value => Math.max(0, Math.min(255, Math.round(value)))
        .toString(16).padStart(2, "0")).join("");
}

function shadeThemeColour(hex, amount) {
    return rgbToHex(hexToRgbParts(hex).map(value => value * (1 - amount)));
}

function mixThemeColours(first, second, amount) {
    const a = hexToRgbParts(first);
    const b = hexToRgbParts(second);
    return rgbToHex(a.map((value, index) => value * (1 - amount) + b[index] * amount));
}

function applyWebsiteTheme(savedTheme = {}) {
    const theme = {
        name: typeof savedTheme.name === "string" ? savedTheme.name : DEFAULT_WEBSITE_THEME.name,
        primary: validThemeColour(savedTheme.primary, DEFAULT_WEBSITE_THEME.primary),
        background: validThemeColour(savedTheme.background, DEFAULT_WEBSITE_THEME.background),
        surface: validThemeColour(savedTheme.surface, DEFAULT_WEBSITE_THEME.surface),
        text: validThemeColour(savedTheme.text, DEFAULT_WEBSITE_THEME.text),
        muted: validThemeColour(savedTheme.muted, DEFAULT_WEBSITE_THEME.muted),
        accent: validThemeColour(savedTheme.accent, DEFAULT_WEBSITE_THEME.accent)
    };

    const root = document.documentElement;
    const accentRgb = hexToRgbParts(theme.accent).join(", ");
    const primaryRgb = hexToRgbParts(theme.primary).join(", ");
    const textRgb = hexToRgbParts(theme.text).join(", ");

    // Map the owner's six palette controls to the site's shared design tokens.
    root.style.setProperty("--site-background", theme.background);
    root.style.setProperty("--green", theme.primary);
    root.style.setProperty("--green-light", theme.surface);
    root.style.setProperty("--green-soft", mixThemeColours(theme.primary, theme.surface, 0.48));
    root.style.setProperty("--green-dark", shadeThemeColour(theme.primary, 0.22));
    root.style.setProperty("--cream", theme.text);
    root.style.setProperty("--cream-dark", theme.muted);
    root.style.setProperty("--gold", theme.accent);
    root.style.setProperty("--gold-dark", shadeThemeColour(theme.accent, 0.18));
    root.style.setProperty("--orange", theme.accent);
    root.style.setProperty("--white", theme.surface);
    root.style.setProperty("--text", theme.text);
    root.style.setProperty("--text-dark", theme.primary);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--border", `rgba(${textRgb}, 0.17)`);
    root.style.setProperty("--accent-rgb", accentRgb);
    root.style.setProperty("--primary-rgb", primaryRgb);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme.background);
}

async function loadWebsiteThemeFromSupabase() {
    if (!supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from("cafe_settings")
            .select("theme_settings")
            .eq("id", true)
            .maybeSingle();

        if (error) throw error;
        applyWebsiteTheme(data?.theme_settings || DEFAULT_WEBSITE_THEME);
    } catch (error) {
        // Keep the built-in website palette if theme settings are not yet available.
        console.warn("Could not load the saved Achaas Cafe website theme. Using the default theme.", error);
        applyWebsiteTheme(DEFAULT_WEBSITE_THEME);
    }
}


/* =========================================================
   ACHAAS CAFE - COMPLETE WEBSITE JAVASCRIPT

   PROJECT:
   Achaas Cafe

   TECHNOLOGY:
   HTML + CSS + JavaScript

   BACKEND:
   Supabase database and Edge Function order submission.

   WHATSAPP:
   +91 9108872368

   FEATURES:
   1. Homepage navigation
   2. About Us, Gallery and Contact Us
   3. 10 menu categories
   4. Confirmed food names and prices
   5. Three images for every food item
   6. Swipe and click image navigation
   7. Quantity selector
   8. Add to Cart
   9. Shopping Cart
   10. Automatic subtotal and total
   11. Customer details
   12. Food preferences
   13. Additional instructions
   14. Free delivery
   15. Supabase online order submission
   17. Cart reset after confirmation
   18. Browser storage

   ========================================================= */


/* =========================================================
   01. WEBSITE SETTINGS
   ========================================================= */

const CAFE = {
    name: "Achaas Cafe",

    whatsappNumber: "919108872368",

    deliveryCharge: 0,

    deliveryDistance: "5 km",

    currency: "₹"
};


/* Browser storage keys */

const CART_STORAGE_KEY = "achaasCafeCart";

const CUSTOMER_STORAGE_KEY = "achaasCafeCustomer";

const PENDING_STORAGE_KEY = "achaasCafePendingOrder";


/* =========================================================
   02. ACTUAL MENU DATA
   ========================================================= */

/*
  FOOD IMAGE FILENAME RULE:

  Every food item needs three images.

  Example:

  images/food/french-fries-1.jpg
  images/food/french-fries-2.jpg
  images/food/french-fries-3.jpg

  Replace these files with actual Achaas Cafe photographs.

  The menu prices below are taken from the supplied menu.
*/

let menuData = [

    /* ---------------- SNACKS ---------------- */

    {
        id: "snacks",

        name: "Snacks",

        emoji: "🍟",

        description: "Delicious snacks",

        cover: "images/food/french-fries-1.jpg",

        items: [

            {
                id: "french-fries",
                name: "French Fries",
                price: 60
            },

            {
                id: "peri-peri-fries",
                name: "Peri Peri Fries",
                price: 80
            },

            {
                id: "loaded-fries",
                name: "Loaded Fries",
                price: 120
            }

        ]
    },


    /* ---------------- SANDWICHES ---------------- */

    {
        id: "sandwiches",

        name: "Sandwiches",

        emoji: "🥪",

        description: "Freshly prepared sandwiches",

        cover: "images/food/zinger-sandwich-1.jpg",

        items: [

            {
                id: "zinger-sandwich",
                name: "Zinger Sandwich",
                price: 110
            },

            {
                id: "cheese-zinger-sandwich",
                name: "Cheese Zinger Sandwich",
                price: 140
            },

            {
                id: "club-zinger-sandwich",
                name: "Club Zinger Sandwich",
                price: 200
            }

        ]
    },


    /* ---------------- BURGERS ---------------- */

    {
        id: "burgers",

        name: "Burgers",

        emoji: "🍔",

        description: "Tasty burgers",

        cover: "images/food/zinger-burger-1.jpg",

        items: [

            {
                id: "zinger-burger",
                name: "Zinger Burger",
                price: 110
            },

            {
                id: "peri-peri-zinger-burger",
                name: "Peri-Peri Zinger Burger",
                price: 140
            },

            {
                id: "cheese-zinger-burger",
                name: "Cheese Zinger Burger",
                price: 160
            }

        ]
    },


    /* ---------------- CHICKEN STRIPS ---------------- */

    {
        id: "chicken-strips",

        name: "Chicken Strips",

        emoji: "🍗",

        description: "Chicken strips and Peri Peri strips",

        cover: "images/food/chicken-strips-3-pieces-1.jpg",

        items: [

            {
                id: "chicken-strips-3-pieces",
                name: "Chicken Strips – 3 Pieces",
                price: 90
            },

            {
                id: "chicken-strips-5-pieces",
                name: "Chicken Strips – 5 Pieces",
                price: 150
            },

            {
                id: "peri-peri-chicken-strips-3-pieces",
                name: "Peri Peri Chicken Strips – 3 Pieces",
                price: 110
            },

            {
                id: "peri-peri-chicken-strips-5-pieces",
                name: "Peri Peri Chicken Strips – 5 Pieces",
                price: 170
            }

        ]
    },


    /* ---------------- WRAP ROLLS ---------------- */

    {
        id: "wrap-rolls",

        name: "Wrap Rolls",

        emoji: "🌯",

        description: "Zinger wraps",

        cover: "images/food/zinger-wrap-1.jpg",

        items: [

            {
                id: "zinger-wrap",
                name: "Zinger Wrap",
                price: 120
            },

            {
                id: "peri-peri-zinger-wrap",
                name: "Peri-Peri Zinger Wrap",
                price: 140
            },

            {
                id: "jumbo-zinger-wrap",
                name: "Jumbo Zinger Wrap",
                price: 160
            }

        ]
    },


    /* ---------------- LAYS CHICKEN CHAAT ---------------- */

    {
        id: "lays-chicken-chaat",

        name: "Lays Chicken Chaat",

        emoji: "🍲",

        description: "Lays Chicken Chaat",

        cover: "images/food/lays-chicken-chaat-1.jpg",

        items: [

            {
                id: "lays-chicken-chaat",
                name: "Lays Chicken Chaat",
                price: 80
            }

        ]
    },


    /* ---------------- EVERYDAY FAVORITES ---------------- */

    {
        id: "everyday-favorites",

        name: "Everyday Favorites",

        emoji: "🍳",

        description: "Egg dishes and favourites",

        cover: "images/food/omelette-1.jpg",

        items: [

            {
                id: "boiled-egg",
                name: "Boiled Egg",
                price: 15
            },

            {
                id: "omelette",
                name: "Omelette",
                price: 60
            },

            {
                id: "bread-omelette",
                name: "Bread Omelette",
                price: 70
            },

            {
                id: "egg-chilli",
                name: "Egg Chilli",
                price: 70
            },

            {
                id: "half-boiled-egg",
                name: "Half Boiled Egg",
                price: 40
            }

        ]
    },


    /* ---------------- MOMOS ---------------- */

    {
        id: "momos",

        name: "Momos",

        emoji: "🥟",

        description: "Chicken steamed and fried momos",

        cover: "images/food/chicken-steamed-momos-1.jpg",

        items: [

            {
                id: "chicken-steamed-momos",
                name: "Chicken Steamed Momos",
                price: 90
            },

            {
                id: "chicken-fried-momos",
                name: "Chicken Fried Momos",
                price: 80
            }

        ]
    },


    /* ---------------- MAGGI ---------------- */

    {
        id: "maggi",

        name: "Maggi",

        emoji: "🍜",

        description: "Maggi favourites",

        cover: "images/food/plain-maggi-1.jpg",

        items: [

            {
                id: "plain-maggi",
                name: "Plain Maggi",
                price: 30
            },

            {
                id: "cheese-maggi",
                name: "Cheese Maggi",
                price: 60
            },

            {
                id: "special-maggi",
                name: "Special Maggi",
                price: 100
            }

        ]
    },


    /* ---------------- TEA AND BEVERAGES ---------------- */

    {
        id: "tea-beverages",

        name: "Tea & Beverages",

        emoji: "☕",

        description: "Tea, coffee and beverages",

        cover: "images/food/tea-1.jpg",

        items: [

            {
                id: "tea",
                name: "Tea",
                price: 15
            },

            {
                id: "coffee",
                name: "Coffee",
                price: 20
            },

            {
                id: "lemon-tea",
                name: "Lemon Tea",
                price: 20
            },

            {
                id: "black-tea",
                name: "Black Tea",
                price: 15
            },

            {
                id: "ginger-tea",
                name: "Ginger Tea",
                price: 20
            }

        ]
    }

];


/* =========================================================
   03. WEBSITE STATE
   ========================================================= */

let cart = readStorage(CART_STORAGE_KEY, {});

let customerData = readStorage(CUSTOMER_STORAGE_KEY, {});

let pendingOrder = readStorage(PENDING_STORAGE_KEY, null);

let selectedCategory = null;

let checkoutExpanded = false;

let toastTimer = null;


/* =========================================================
   04. BROWSER STORAGE FUNCTIONS
   ========================================================= */

function readStorage(key, fallback) {

    try {

        const saved = localStorage.getItem(key);

        return saved ? JSON.parse(saved) : fallback;

    } catch (error) {

        console.warn("Could not read browser storage:", error);

        return fallback;

    }

}


function saveStorage(key, value) {

    try {

        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

    } catch (error) {

        console.warn("Could not save browser storage:", error);

        showToast(
            "Browser storage is unavailable. Keep this page open."
        );

    }

}


function removeStorage(key) {

    try {

        localStorage.removeItem(key);

    } catch (error) {

        console.warn("Could not remove browser storage:", error);

    }

}


function saveCart() {

    saveStorage(CART_STORAGE_KEY, cart);

}


function saveCustomerData() {

    saveStorage(CUSTOMER_STORAGE_KEY, customerData);

}


function savePendingOrder() {

    if (pendingOrder) {

        saveStorage(
            PENDING_STORAGE_KEY,
            pendingOrder
        );

    } else {

        removeStorage(PENDING_STORAGE_KEY);

    }

}


/* =========================================================
   05. COMMON HELPER FUNCTIONS
   ========================================================= */

function formatPrice(amount) {

    return CAFE.currency +
        Number(amount).toLocaleString("en-IN");

}


function getAllItems() {

    return menuData.flatMap(category =>

        category.items.map(item => ({

            ...item,

            categoryName: category.name,

            categoryId: category.id

        }))

    );

}


function getItemById(id) {

    return getAllItems().find(
        item => item.id === id
    );

}


function getCategoryById(id) {

    return menuData.find(
        category => category.id === id
    );

}


function getImagePath(itemId, imageNumber) {

    const item = getItemById(itemId);

    if (item && item.imageUrl) {

        return item.imageUrl;

    }

    return `images/food/${itemId}-${imageNumber}.jpg`;

}


function cartQuantity() {

    return Object.values(cart).reduce(

        (sum, quantity) => {

            return sum + Number(quantity || 0);

        },

        0

    );

}


function getSubtotal() {

    return Object.entries(cart).reduce(

        (sum, [id, quantity]) => {

            const item = getItemById(id);

            return item
                ? sum + item.price * quantity
                : sum;

        },

        0

    );

}


function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, character => ({

        "&": "&amp;",

        "<": "&lt;",

        ">": "&gt;",

        '"': "&quot;",

        "'": "&#39;"

    }[character]));

}


/* =========================================================
   06. TOAST NOTIFICATIONS
   ========================================================= */

function showToast(message) {

    const toast = document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 2600);

}


/* =========================================================
   07. PAGE NAVIGATION WITH BROWSER BACK AND FORWARD
   ========================================================= */

const allViews = [

    "homeView",
    "aboutView",
    "galleryView",
    "contactView",
    "menuView",
    "cartView"

];


function renderNavigationState(state) {

    const viewMap = {

        home: "homeView",
        about: "aboutView",
        gallery: "galleryView",
        contact: "contactView",
        menu: "menuView",
        cart: "cartView"

    };

    const viewName = state.view || "home";

    const selectedView = viewMap[viewName];

    if (!selectedView) return;


    allViews.forEach(id => {

        const element = document.getElementById(id);

        if (element) {

            element.classList.toggle(
                "hidden",
                id !== selectedView
            );

        }

    });


    /* Restore menu category when using Back or Forward */

    if (viewName === "menu") {

        const category = state.category
            ? getCategoryById(state.category)
            : null;

        const listPanel = document.getElementById(
            "categoryListPanel"
        );

        const detailPanel = document.getElementById(
            "categoryDetailPanel"
        );

        if (category) {

            selectedCategory = category.id;

            listPanel.classList.add("hidden");

            detailPanel.classList.remove("hidden");

            document.getElementById(
                "selectedCategoryTitle"
            ).textContent = category.name;

            renderProducts(category);

        } else {

            selectedCategory = null;

            listPanel.classList.remove("hidden");

            detailPanel.classList.add("hidden");

        }

    }


    if (viewName === "cart") {

        renderCart();

    }


    window.scrollTo({
        top: 0,
        behavior: "auto"
    });


    closeMobileMenu();

}


/* Navigate and save browser history */

function navigateTo(state) {

    const current = history.state;

    if (
        current &&
        current.view === state.view &&
        current.category === state.category
    ) {

        renderNavigationState(state);

        return;

    }


    history.pushState(state, "");

    renderNavigationState(state);

}


/* Normal website navigation */

function showView(viewName) {

    navigateTo({

        view: viewName,

        category: null

    });

}


function openMenu() {

    showCategories();

}


function openCart() {

    showView("cart");

}


function toggleMobileMenu() {

    const navigation = document.getElementById("mobileNav");

    const button = document.getElementById("menuToggle");

    if (!navigation || !button) return;

    navigation.classList.toggle("open");

    button.setAttribute(

        "aria-expanded",

        navigation.classList.contains("open")
            ? "true"
            : "false"

    );

}


function closeMobileMenu() {

    const navigation = document.getElementById("mobileNav");

    const button = document.getElementById("menuToggle");

    if (navigation) {

        navigation.classList.remove("open");

    }

    if (button) {

        button.setAttribute("aria-expanded", "false");

    }

}


/* Browser Back and Forward buttons */

window.addEventListener("popstate", function(event) {

    renderNavigationState(

        event.state || { view: "home", category: null }

    );

});


/* =========================================================
   LOAD LIVE MENU FROM SUPABASE
   ========================================================= */

function firstValue(row, names, fallback = null) {

    for (const name of names) {

        if (row && row[name] !== undefined && row[name] !== null) {

            return row[name];

        }

    }

    return fallback;

}

function categoryEmoji(value) {

    const slug = String(value || "").toLowerCase();

    if (slug.includes("snack")) return "🍟";
    if (slug.includes("sandwich")) return "🥪";
    if (slug.includes("burger")) return "🍔";
    if (slug.includes("strip")) return "🍗";
    if (slug.includes("wrap")) return "🌯";
    if (slug.includes("chaat")) return "🥗";
    if (slug.includes("everyday") || slug.includes("egg")) return "🍳";
    if (slug.includes("momo")) return "🥟";
    if (slug.includes("maggi")) return "🍜";
    if (slug.includes("tea") || slug.includes("beverage")) return "☕";

    return "🍽️";

}

async function loadMenuFromSupabase() {

    const categoryGrid = document.getElementById("categoryGrid");

    if (categoryGrid) {

        categoryGrid.innerHTML = '<p class="form-note">Loading menu...</p>';

    }

    if (!supabaseClient) {

        if (categoryGrid) categoryGrid.innerHTML = '<p class="form-note">Menu connection could not start. Please refresh this page.</p>';

        showToast("Supabase connection is unavailable.");

        return;

    }

    try {

        const [categoryResult, itemResult] = await Promise.all([
            supabaseClient.from("categories").select("*"),
            supabaseClient.from("food_items").select("*")
        ]);

        if (categoryResult.error) throw categoryResult.error;
        if (itemResult.error) throw itemResult.error;

        const categories = (categoryResult.data || []).filter(row =>
            firstValue(row, ["is_active", "active"], true) !== false
        );

        const items = (itemResult.data || []).filter(row =>
            firstValue(row, ["is_active", "active"], true) !== false &&
            firstValue(row, ["is_available", "available"], true) !== false
        );

        menuData = categories.map(category => {

            const categoryId = firstValue(category, ["id", "category_id"]);
            const categoryName = firstValue(category, ["name", "category_name", "title"], "Menu");
            const categorySlug = firstValue(category, ["slug", "name", "category_name"], categoryName);

            const categoryItems = items
                .filter(item => firstValue(item, ["category_id", "categoryId"]) === categoryId)
                .map(item => ({
                    id: firstValue(item, ["id", "food_item_id"]),
                    name: firstValue(item, ["name", "item_name", "title"], "Food item"),
                    price: Number(firstValue(item, ["price", "selling_price", "unit_price"], 0)),
                    imageUrl: firstValue(item, ["image_url", "image", "photo_url"], null),
                    description: firstValue(item, ["description", "details"], "")
                }))
                .filter(item => item.id && Number.isFinite(item.price));

            return {
                id: categoryId,
                name: categoryName,
                emoji: categoryEmoji(categorySlug),
                description: firstValue(category, ["description"], "Freshly prepared favourites"),
                cover: firstValue(category, ["image_url", "cover_image_url", "image"], ""),
                items: categoryItems
            };

        }).filter(category => category.id && category.items.length > 0);

        if (!menuData.length) {

            if (categoryGrid) categoryGrid.innerHTML = '<p class="form-note">No menu items are available right now. Please check again later.</p>';

            return;

        }

        /* Old locally saved cart IDs do not match Supabase UUIDs. */
        const validIds = new Set(getAllItems().map(item => item.id));
        cart = Object.fromEntries(Object.entries(cart).filter(([id, quantity]) => validIds.has(id) && Number(quantity) > 0));
        saveCart();

        renderCategories();
        updateCartCount();

        if (history.state && history.state.view === "menu" && history.state.category) {
            const activeCategory = getCategoryById(history.state.category);
            if (activeCategory) renderProducts(activeCategory);
        }

    } catch (error) {

        console.error("Could not load menu from Supabase:", error);

        if (categoryGrid) categoryGrid.innerHTML = '<p class="form-note">The menu could not be loaded. Please refresh or try again later.</p>';

        showToast("Could not load the menu. Please try again.");

    }

}


/* =========================================================
   08. MENU CATEGORY DISPLAY
   ========================================================= */

function renderCategories() {

    const container = document.getElementById("categoryGrid");

    if (!container) return;


    container.innerHTML = menuData.map(category => `

        <button

            type="button"

            class="category-card"

            onclick="openCategory('${category.id}')">

            <img

                src="${category.cover}"

                alt="${escapeHTML(category.name)}"

                class="category-image">

            <div class="category-info">

                <h3>${escapeHTML(category.name)}</h3>

                <p>${category.items.length} food items</p>

            </div>

        </button>

    `).join("");


    attachCategoryImageFallbacks(container);

}


/* Replace unavailable category images with a simple placeholder */

function attachCategoryImageFallbacks(container) {

    container.querySelectorAll(".category-image").forEach(img => {

        img.addEventListener("error", function () {

            const category = menuData.find(
                item => item.cover === this.getAttribute("src")
            );

            const fallback = document.createElement("div");

            fallback.className = "category-image-fallback";

            fallback.textContent = category
                ? category.emoji
                : "🍽️";

            this.replaceWith(fallback);

        }, { once: true });

    });

}



function showCategories() {

    navigateTo({

        view: "menu",

        category: null

    });

}



function openCategory(categoryId) {

    const category = getCategoryById(categoryId);

    if (!category) return;

    navigateTo({

        view: "menu",

        category: categoryId

    });

}



/* =========================================================
   09. FOOD PRODUCT DISPLAY
   ========================================================= */

function renderProducts(category) {

    const container = document.getElementById("productGrid");

    if (!container) return;


    container.innerHTML = category.items.map(item => `

        <article

            class="product-card"

            data-product="${item.id}">


            <div class="product-photo-area">

                <div

                    class="product-main-photo"

                    data-gallery="${item.id}">

                    <img

                        src="${getImagePath(item.id, 1)}"

                        alt="${escapeHTML(item.name)}"

                        data-main-image="${item.id}">

                </div>

            </div>


            <div class="product-info">


                <div class="product-title-row">

                    <h3>${escapeHTML(item.name)}</h3>

                    <span class="product-price">

                        ${formatPrice(item.price)}

                    </span>

                </div>


                <div class="product-controls">


                    <div class="qty-control">


                        <button

                            type="button"

                            aria-label="Decrease quantity"

                            onclick="changeProductQuantity('${item.id}', -1)">

                            −

                        </button>


                        <span id="quantity-${item.id}">

                            ${cart[item.id] || 1}

                        </span>


                        <button

                            type="button"

                            aria-label="Increase quantity"

                            onclick="changeProductQuantity('${item.id}', 1)">

                            +

                        </button>


                    </div>


                    <button

                        type="button"

                        class="btn btn-primary btn-small"

                        onclick="addToCart('${item.id}')">

                        Add to Cart

                    </button>


                </div>


            </div>


        </article>

    `).join("");


    attachProductImageFallbacks(container);

}

/* =========================================================
   10. FOOD IMAGE FALLBACKS
   ========================================================= */

function attachProductImageFallbacks(container) {

    container.querySelectorAll(
        ".product-main-photo img"
    ).forEach(img => {

        img.addEventListener("error", function () {

            this.style.display = "none";

            this.parentElement.classList.add("no-photo");

        }, { once: true });

    });


    container.querySelectorAll(
        ".thumbnail img"
    ).forEach(img => {

        img.addEventListener("error", function () {

            this.style.display = "none";

        }, { once: true });

    });

}


/* =========================================================
   11. THREE-IMAGE FOOD GALLERY
   ========================================================= */

function selectFoodPhoto(itemId, imageNumber) {

    const card = document.querySelector(

        `[data-product="${itemId}"]`

    );

    if (!card) return;


    const mainImage = card.querySelector(

        `[data-main-image="${itemId}"]`

    );


    const gallery = card.querySelector(

        `[data-gallery="${itemId}"]`

    );


    if (!mainImage || !gallery) return;


    gallery.dataset.currentImage = imageNumber;


    mainImage.src = getImagePath(

        itemId,

        imageNumber

    );

    mainImage.style.display = "block";


    gallery.classList.remove("no-photo");


    card.querySelectorAll(
        "[data-thumbnail]"
    ).forEach(button => {

        button.classList.toggle(

            "active",

            Number(button.dataset.number) === imageNumber

        );

    });

}


function changeFoodPhoto(itemId, direction) {

    const gallery = document.querySelector(

        `[data-gallery="${itemId}"]`

    );

    if (!gallery) return;


    let current = Number(

        gallery.dataset.currentImage || 1

    );


    current += direction;


    if (current > 3) current = 1;

    if (current < 1) current = 3;


    selectFoodPhoto(itemId, current);

}


/* Swipe functionality */

function attachSwipeToGalleries(container) {

    container.querySelectorAll(
        ".product-main-photo"
    ).forEach(gallery => {

        let startX = 0;

        gallery.addEventListener("touchstart", event => {

            startX = event.changedTouches[0].screenX;

        }, { passive: true });


        gallery.addEventListener("touchend", event => {

            const endX = event.changedTouches[0].screenX;

            const difference = endX - startX;


            if (Math.abs(difference) > 45) {

                const itemId = gallery.dataset.gallery;

                changeFoodPhoto(

                    itemId,

                    difference < 0 ? 1 : -1

                );

            }

        }, { passive: true });

    });

}


/* =========================================================
   12. PRODUCT QUANTITY
   ========================================================= */

function changeProductQuantity(itemId, difference) {

    const quantityElement = document.getElementById(

        `quantity-${itemId}`

    );

    if (!quantityElement) return;


    let quantity = Number(

        quantityElement.textContent

    ) || 1;


    quantity += difference;


    quantity = Math.max(1, quantity);


    quantityElement.textContent = quantity;

}


/* =========================================================
   13. ADD TO CART
   ========================================================= */

function addToCart(itemId) {

    const item = getItemById(itemId);

    if (!item) return;


    const quantityElement = document.getElementById(

        `quantity-${itemId}`

    );

    if (!quantityElement) return;


    const quantity = Math.max(

        1,

        Number(quantityElement.textContent) || 1

    );


    /* Add quantity to the existing cart item */

    cart[itemId] = (cart[itemId] || 0) + quantity;


    saveCart();

    updateCartCount();


    showToast(

        item.name + " added to your Shopping Cart!"

    );

}


/* =========================================================
   14. CART COUNT
   ========================================================= */

function updateCartCount() {

    const counter = document.getElementById("cartCount");

    if (!counter) return;


    counter.textContent = cartQuantity();

}


/* =========================================================
   15. CART CALCULATIONS
   ========================================================= */

function getFinalTotal() {

    return getSubtotal() + CAFE.deliveryCharge;

}


/* =========================================================
   16. SHOPPING CART DISPLAY
   ========================================================= */

function renderCart() {

    updateCartCount();


    /* Remove unknown or invalid cart entries */

    const cartIds = Object.keys(cart).filter(id => {

        return getItemById(id) && Number(cart[id]) > 0;

    });


    cart = Object.fromEntries(

        cartIds.map(id => [

            id,

            Number(cart[id])

        ])

    );


    saveCart();


    const empty = cartIds.length === 0;


    document.getElementById(
        "emptyCart"
    ).classList.toggle(

        "hidden",

        !empty

    );


    document.getElementById(
        "cartContent"
    ).classList.toggle(

        "hidden",

        empty

    );


    const successPanel = document.getElementById("orderSuccessPanel");
    if (successPanel && Object.keys(cart).length > 0) successPanel.classList.add("hidden");


    if (empty) {

        document.getElementById(
            "cartItems"
        ).innerHTML = "";

        updateCartCount();

        return;

    }


    const container = document.getElementById("cartItems");


    container.innerHTML = cartIds.map(id => {

        const item = getItemById(id);

        const quantity = cart[id];

        const total = item.price * quantity;


        return `

            <article class="cart-item">


                <img

                    src="${getImagePath(item.id, 1)}"

                    alt="${escapeHTML(item.name)}"

                    class="cart-item-photo">


                <div>


                    <h3>${escapeHTML(item.name)}</h3>


                    <div class="cart-item-meta">

                        ${formatPrice(item.price)} each

                    </div>


                    <div class="cart-item-bottom">


                        <div class="qty-control">


                            <button

                                type="button"

                                aria-label="Decrease quantity"

                                onclick="changeCartQuantity('${id}', -1)">

                                −

                            </button>


                            <span>${quantity}</span>


                            <button

                                type="button"

                                aria-label="Increase quantity"

                                onclick="changeCartQuantity('${id}', 1)">

                                +

                            </button>


                        </div>


                        <span class="cart-item-total">

                            ${formatPrice(total)}

                        </span>


                        <button

                            type="button"

                            class="remove-button"

                            onclick="removeCartItem('${id}')">

                            Remove

                        </button>


                    </div>


                </div>


            </article>

        `;

    }).join("");


    /* Automatic total calculations */

    const subtotal = getSubtotal();

    const total = getFinalTotal();


    document.getElementById(
        "cartSubtotal"
    ).textContent = formatPrice(subtotal);


    document.getElementById(
        "cartTotal"
    ).textContent = formatPrice(total);


    document.getElementById(
        "checkoutTotal"
    ).textContent = formatPrice(total);


    restoreCustomerFields();

    updateCartCount();

}


/* =========================================================
   17. CART QUANTITY CONTROLS
   ========================================================= */

function changeCartQuantity(itemId, difference) {

    if (!cart[itemId]) return;


    cart[itemId] += difference;


    if (cart[itemId] <= 0) {

        delete cart[itemId];

    }


    saveCart();

    renderCart();

}


function removeCartItem(itemId) {

    delete cart[itemId];


    saveCart();

    renderCart();


    showToast("Item removed from cart.");

}


/* =========================================================
   18. CUSTOMER CHECKOUT PANEL
   ========================================================= */

function toggleCheckout() {

    if (Object.keys(cart).length === 0) {

        showToast("Please add food items first.");

        return;

    }


    checkoutExpanded = !checkoutExpanded;


    const panel = document.getElementById(
        "checkoutPanel"
    );


    panel.classList.toggle(

        "hidden",

        !checkoutExpanded

    );


    document.getElementById(
        "detailsButton"
    ).textContent = checkoutExpanded

        ? "Hide Customer Details"

        : "Add Your Details to Order";


    if (checkoutExpanded) {

        restoreCustomerFields();


        setTimeout(() => {

            panel.scrollIntoView({

                behavior: "smooth",

                block: "start"

            });

        }, 100);

    }

}


/* =========================================================
   19. CUSTOMER INFORMATION
   ========================================================= */

function collectCustomerData() {

    const name = document.getElementById(
        "customerName"
    ).value.trim();


    const phone = document.getElementById(
        "customerPhone"
    ).value.trim();


    const address = document.getElementById(
        "customerAddress"
    ).value.trim();


    const instructions = document.getElementById(
        "foodInstructions"
    ).value.trim();


    const preferences = Array.from(

        document.querySelectorAll(
            'input[name="preference"]:checked'
        )

    ).map(input => input.value);


    return {

        name,

        phone,

        address,

        preferences,

        instructions

    };

}


/* =========================================================
   20. RESTORE CUSTOMER INFORMATION
   ========================================================= */

function restoreCustomerFields() {

    const fields = {

        customerName: customerData.name || "",

        customerPhone: customerData.phone || "",

        customerAddress: customerData.address || "",

        foodInstructions: customerData.instructions || ""

    };


    Object.entries(fields).forEach(([id, value]) => {

        const element = document.getElementById(id);

        if (element && !element.value) {

            element.value = value;

        }

    });


    if (customerData.preferences) {

        document.querySelectorAll(

            'input[name="preference"]'

        ).forEach(input => {

            input.checked = customerData.preferences.includes(
                input.value
            );

        });

    }

}

/* =========================================================
   25. REOPEN WHATSAPP ORDER
   ==

/* =========================================================
   21. SAVE CUSTOMER INFORMATION
   ========================================================= */

function saveCurrentCustomerDetails() {

    customerData = collectCustomerData();

    saveCustomerData();

}


/* =========================================================
   22. CREATE WHATSAPP ORDER MESSAGE
   ========================================================= */

function buildWhatsAppMessage(details) {

    const lines = [];


    lines.push("*NEW ORDER - ACHAAS CAFE*");


    lines.push("");

    lines.push("");

    lines.push("*CUSTOMER DETAILS*");

    lines.push("Name: " + details.name);

    lines.push("Mobile: " + details.phone);

    lines.push("Delivery Address: " + details.address);


    lines.push("");

    lines.push("");

    lines.push("*ORDER ITEMS*");


    Object.entries(cart).forEach(([id, quantity], index) => {

        const item = getItemById(id);

        if (!item) return;


        const itemTotal = item.price * quantity;


        lines.push(

            `${index + 1}. ${item.name} x ${quantity} = ${formatPrice(itemTotal)}`

        );

    });


    lines.push("");

    lines.push("");

    lines.push(
        "*FOOD SUBTOTAL: " + formatPrice(getSubtotal()) + "*"
    );


    lines.push("");

    lines.push(
        "*DELIVERY CHARGE: " + formatPrice(CAFE.deliveryCharge) + "*"
    );


    lines.push("");

    lines.push(
        "*FINAL TOTAL: " + formatPrice(getFinalTotal()) + "*"
    );


    lines.push("");

    lines.push("");

    lines.push("*FOOD PREFERENCES*");


    if (details.preferences.length > 0) {

        details.preferences.forEach(preference => {

            lines.push("- " + preference);

        });

    } else {

        lines.push("No selected preferences.");

    }


    lines.push("");

    lines.push("");

    lines.push("*ADDITIONAL INSTRUCTIONS*");


    lines.push(

        details.instructions || "No additional instructions."

    );


    lines.push("");

    lines.push("");

    lines.push(
        "Please confirm food availability, delivery address and order."
    );


    return lines.join("\n");

}



/* =========================================================
   23. WHATSAPP ORDER VALIDATION
   ========================================================= */

function validateCustomerDetails(details) {

    if (!details.name) {

        showToast("Please enter your name.");

        document.getElementById(
            "customerName"
        ).focus();

        return false;

    }


    const phoneDigits = details.phone.replace(/\D/g, "");


    if (
        phoneDigits.length < 10 ||
        phoneDigits.length > 15
    ) {

        showToast("Please enter a valid mobile number.");

        document.getElementById(
            "customerPhone"
        ).focus();

        return false;

    }


    if (!details.address) {

        showToast("Please enter your delivery address.");

        document.getElementById(
            "customerAddress"
        ).focus();

        return false;

    }


    return true;

}


/* =========================================================
   SUBMIT ORDER THROUGH THE WEBSITE BACKEND
   ========================================================= */

async function placeWebsiteOrder() {

    if (Object.keys(cart).length === 0) {

        showToast("Your cart is empty.");
        return;

    }

    const details = collectCustomerData();

    if (!validateCustomerDetails(details)) return;

    const orderItems = Object.entries(cart).map(([foodItemId, quantity]) => ({
        foodItemId,
        quantity: Number(quantity)
    }));

    if (orderItems.some(item => !getItemById(item.foodItemId))) {

        showToast("Your cart contains an unavailable item. Please refresh the menu.");
        return;

    }

    const orderButton = document.querySelector('button[onclick="placeWebsiteOrder()"]');

    if (orderButton) {

        orderButton.disabled = true;
        orderButton.dataset.originalText = orderButton.textContent.trim();
        orderButton.textContent = "Submitting...";

    }

    try {

        const response = await fetch(ORDER_FUNCTION_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                customerName: details.name,
                customerPhone: details.phone,
                customerAddress: details.address,
                preferences: details.preferences,
                instructions: details.instructions,
                items: orderItems
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success !== true) {

            throw new Error(result.error || result.message || "Order submission failed.");

        }

        const orderNumber = result.orderNumber ? `Order #${result.orderNumber} has been received.` : "Your order has been received.";

        const successPanel = document.getElementById("orderSuccessPanel");
        const successMessage = document.getElementById("orderSuccessMessage");

        if (successMessage) successMessage.textContent = orderNumber + " The cafe will contact you to confirm it.";
        if (successPanel) successPanel.classList.remove("hidden");

        cart = {};
        customerData = {};
        pendingOrder = null;
        checkoutExpanded = false;

        saveCart();
        saveCustomerData();
        savePendingOrder();

        const form = document.getElementById("customerForm");
        if (form) form.reset();

        const checkoutPanel = document.getElementById("checkoutPanel");
        if (checkoutPanel) checkoutPanel.classList.add("hidden");

        const detailsButton = document.getElementById("detailsButton");
        if (detailsButton) detailsButton.textContent = "Add Your Details to Order";

        renderCart();
        showToast("Your order has been submitted successfully.");

    } catch (error) {

        console.error("Order submission error:", error);
        showToast(error.message || "Could not submit your order. Please try again.");

    } finally {

        if (orderButton) {

            orderButton.disabled = false;
            orderButton.textContent = orderButton.dataset.originalText || "Place Order";
            delete orderButton.dataset.originalText;

        }

    }

}


/* =========================================================
   28. AUTO-SAVE CUSTOMER FORM
   ========================================================= */

function attachCustomerAutoSave() {

    const form = document.getElementById("customerForm");

    if (!form) return;


    form.addEventListener("input", () => {

        saveCurrentCustomerDetails();

    });


    form.addEventListener("change", () => {

        saveCurrentCustomerDetails();

    });

}


/* =========================================================
   29. WEBSITE INITIALIZATION
   ========================================================= */

async function initializeWebsite() {

    /* Apply the theme published by the owner to the entire customer website. */

    await loadWebsiteThemeFromSupabase();


    /* Set homepage as browser history starting point */

    history.replaceState(
        { view: "home", category: null },
        ""
    );


    /* Load categories and food items from Supabase */

    loadMenuFromSupabase();


    /* Update cart counter */

    updateCartCount();


    /* Display current year */

    const year = document.getElementById("currentYear");

    if (year) {

        year.textContent = new Date().getFullYear();

    }


    /* Enable automatic customer form saving */

    attachCustomerAutoSave();


    /* Restore customer fields */

    restoreCustomerFields();



}


/* =========================================================
   30. RETURNING FROM WHATSAPP
   ========================================================= */

/*
   When customer returns from WhatsApp,
   show the pending confirmation.

   This does NOT automatically clear the cart.

   Customer must confirm manually.
*/




/* =========================================================
   31. START WEBSITE
   ========================================================= */

/*
   index.html must connect this file using:

   <script src="script.js" defer></script>

   This makes sure the HTML is ready before initialization.
*/

document.addEventListener(
    "DOMContentLoaded",
    initializeWebsite
);


/* =========================================================
   END OF ACHAAS CAFE JAVASCRIPT
   ========================================================= */
