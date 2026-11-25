
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

function relLuminance(hex) {
    const [r, g, b] = hexToRgbParts(hex).map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
    const x = relLuminance(a), y = relLuminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* Pick a readable text colour for a given background. */
function readableOn(background, preferred) {
    for (const colour of [preferred, "#111111", "#ffffff"]) {
        if (contrastRatio(background, colour) >= 4.5) return colour;
    }
    return contrastRatio(background, "#111111") >= contrastRatio(background, "#ffffff") ? "#111111" : "#ffffff";
}

const THEME_CACHE_KEY = "achaasCafeThemeVars";

function applyWebsiteTheme(savedTheme = {}, cache = true) {
    savedTheme = savedTheme && typeof savedTheme === "object" ? savedTheme : {};
    const theme = {
        name: typeof savedTheme.name === "string" ? savedTheme.name : DEFAULT_WEBSITE_THEME.name,
        primary: validThemeColour(savedTheme.primary, DEFAULT_WEBSITE_THEME.primary),
        background: validThemeColour(savedTheme.background, DEFAULT_WEBSITE_THEME.background),
        surface: validThemeColour(savedTheme.surface, DEFAULT_WEBSITE_THEME.surface),
        text: validThemeColour(savedTheme.text, DEFAULT_WEBSITE_THEME.text),
        muted: validThemeColour(savedTheme.muted, DEFAULT_WEBSITE_THEME.muted),
        accent: validThemeColour(savedTheme.accent, DEFAULT_WEBSITE_THEME.accent)
    };

    const accentRgb = hexToRgbParts(theme.accent).join(", ");
    const primaryRgb = hexToRgbParts(theme.primary).join(", ");
    const textRgb = hexToRgbParts(theme.text).join(", ");

    const vars = {
        "--site-background": theme.background,
        "--green": theme.primary,
        "--green-light": theme.surface,
        "--green-soft": mixThemeColours(theme.primary, theme.surface, 0.48),
        "--green-dark": shadeThemeColour(theme.primary, 0.22),
        "--cream": theme.text,
        "--cream-dark": theme.muted,
        "--gold": theme.accent,
        "--gold-dark": shadeThemeColour(theme.accent, 0.18),
        "--orange": theme.accent,
        "--white": theme.surface,
        "--text": theme.text,
        "--text-dark": theme.primary,
        "--muted": theme.muted,
        "--border": `rgba(${textRgb}, 0.17)`,
        "--accent-rgb": accentRgb,
        "--primary-rgb": primaryRgb,
        "--on-accent": readableOn(theme.accent, theme.primary),
        "--on-cream": readableOn(theme.text, theme.primary)
    };

    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));

    if (cache) {
        try { localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(vars)); } catch (error) { /* storage unavailable */ }
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme.background);
}

/* Only http(s) URLs are accepted from the database. */
function safeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value.trim(), window.location.href);
        return (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
    } catch (error) {
        return null;
    }
}

function applyCafeSettings(settings) {
    if (!settings || typeof settings !== "object") return;

    const phone = String(settings.phone || "").trim();
    const digits = phone.replace(/\D/g, "");
    if (phone) {
        document.querySelectorAll('[data-cafe="phone"]').forEach(el => { el.textContent = phone; });
    }
    if (digits.length >= 10) {
        const whatsapp = digits.length === 10 ? "91" + digits : digits;
        CAFE.whatsappNumber = whatsapp;
        document.querySelectorAll("[data-cafe-wa]").forEach(a => { a.href = "https://wa.me/" + whatsapp; });
    }

    const address = String(settings.address || "").trim();
    if (address) {
        document.querySelectorAll('[data-cafe="address"]').forEach(el => { el.textContent = address; });
    }

    const hours = [settings.opening_hours, settings.weekly_holidays ? "Closed: " + settings.weekly_holidays : ""]
        .map(v => String(v || "").trim()).filter(Boolean).join("\n");
    document.querySelectorAll('[data-cafe-row="hours"]').forEach(row => {
        row.classList.toggle("hidden", !hours);
        const target = row.querySelector('[data-cafe="hours"]');
        if (target) target.textContent = hours;
    });

    const maps = safeUrl(settings.maps_url);
    document.querySelectorAll("[data-cafe-maps]").forEach(a => {
        if (maps) a.href = maps;
        a.classList.toggle("hidden", !maps);
    });

    const social = settings.social_links && typeof settings.social_links === "object" ? settings.social_links : {};
    const socialUrl = (value, base) => {
        const text = String(value || "").trim();
        if (!text) return null;
        return safeUrl(/^https?:\/\//i.test(text) ? text : base + text.replace(/^@/, ""));
    };
    [["instagram", "https://instagram.com/"], ["facebook", "https://facebook.com/"]].forEach(([key, base]) => {
        const link = socialUrl(social[key], base);
        document.querySelectorAll(`[data-cafe-social="${key}"]`).forEach(a => {
            if (link) a.href = link;
            a.classList.toggle("hidden", !link);
        });
    });

    const logo = safeUrl(settings.logo_url);
    if (logo) {
        const brand = document.querySelector(".site-header .brand");
        if (brand && !brand.querySelector(".brand-logo")) {
            const img = document.createElement("img");
            img.className = "brand-logo";
            img.alt = "";
            img.src = logo;
            img.addEventListener("error", () => img.remove(), { once: true });
            brand.prepend(img);
        }
    }

    const desktopBanner = safeUrl(settings.homepage_banner_url);
    const mobileBanner = safeUrl(settings.mobile_banner_url);
    const heroImage = document.querySelector(".hero-image");
    if (heroImage && (desktopBanner || mobileBanner)) {
        document.querySelectorAll(".hero-picture source").forEach(source => {
            if (desktopBanner) source.setAttribute("srcset", desktopBanner);
        });
        heroImage.style.display = "";
        heroImage.src = mobileBanner || desktopBanner;
    }
}

function hasCachedTheme() {
    try { return !!localStorage.getItem(THEME_CACHE_KEY); } catch (error) { return false; }
}

async function loadCafeSettings() {
    if (!supabaseClient) return;

    try {
        /* select("*") keeps the site working even if theme_settings has not been added yet. */
        const { data, error } = await supabaseClient
            .from("cafe_settings")
            .select("*")
            .eq("id", true)
            .maybeSingle();

        if (error) throw error;
        applyWebsiteTheme(data?.theme_settings || DEFAULT_WEBSITE_THEME);
        applyCafeSettings(data);
    } catch (error) {
        console.warn("Could not load the Achaas Cafe settings. Keeping the current theme.", error);
        if (!hasCachedTheme()) applyWebsiteTheme(DEFAULT_WEBSITE_THEME, false);
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

const REMEMBER_STORAGE_KEY = "achaasCafeRemember";



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


let selectedCategory = null;

let checkoutExpanded = false;


let appliedCouponCode = "";

let appliedCouponDiscount = 0;


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


const VIEW_IDS = {
    home: "homeView",
    about: "aboutView",
    gallery: "galleryView",
    contact: "contactView",
    menu: "menuView",
    cart: "cartView"
};

function stateFromHash() {
    const name = (window.location.hash || "").replace(/^#\/?/, "").split("/")[0].toLowerCase();
    return { view: VIEW_IDS[name] ? name : "home", category: null };
}

function urlForState(state) {
    return state.view === "home"
        ? window.location.pathname + window.location.search
        : "#" + state.view;
}

let firstNavigationRender = true;

function renderNavigationState(state) {

    const viewName = state.view || "home";
    const selectedView = VIEW_IDS[viewName];
    if (!selectedView) return;

    allViews.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.toggle("hidden", id !== selectedView);
    });

    if (viewName === "menu") {

        const category = state.category ? getCategoryById(state.category) : null;
        const listPanel = document.getElementById("categoryListPanel");
        const detailPanel = document.getElementById("categoryDetailPanel");

        if (category) {
            selectedCategory = category.id;
            listPanel.classList.add("hidden");
            detailPanel.classList.remove("hidden");
            document.getElementById("selectedCategoryTitle").textContent = category.name;
            renderProducts(category);
        } else {
            selectedCategory = null;
            listPanel.classList.remove("hidden");
            detailPanel.classList.add("hidden");
        }
    }

    if (viewName === "cart") renderCart();

    window.scrollTo({ top: 0, behavior: "auto" });

    closeMobileMenu();

    /* Move keyboard / screen-reader focus to the new page heading. */
    if (!firstNavigationRender) {
        const heading = document.querySelector("#" + selectedView + " h1:not(.hidden)");
        const visible = heading && heading.offsetParent !== null ? heading : document.querySelector("#" + selectedView + " h1");
        if (visible) {
            visible.setAttribute("tabindex", "-1");
            visible.focus({ preventScroll: true });
        }
    }
    firstNavigationRender = false;
}


/* Navigate and save browser history */

function navigateTo(state) {

    const current = history.state;

    if (current && current.view === state.view && current.category === state.category) {
        renderNavigationState(state);
        return;
    }

    history.pushState(state, "", urlForState(state));
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

    renderNavigationState(event.state || stateFromHash());

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

let menuLoaded = false;
let menuFailed = false;

function showMenuError(message) {

    const grid = document.getElementById("categoryGrid");

    if (grid) {
        grid.innerHTML = '<p class="form-note">' + escapeHTML(message) + '</p>' +
            '<button type="button" class="btn btn-primary btn-small" style="margin-top:12px;" onclick="loadMenuFromSupabase()">Try again</button>';
    }

}

async function loadMenuFromSupabase() {

    const categoryGrid = document.getElementById("categoryGrid");

    if (categoryGrid) categoryGrid.innerHTML = '<p class="form-note">Loading menu...</p>';

    menuFailed = false;

    if (!supabaseClient) {
        menuFailed = true;
        showMenuError("Menu connection could not start. Please check your internet connection and refresh.");
        refreshCartIfOpen();
        return;
    }

    /* Ordered by the owner's sort order; falls back to unordered if a table has no sort_order column. */
    const fetchTable = async (table, withName) => {
        let query = supabaseClient.from(table).select("*").order("sort_order", { ascending: true });
        if (withName) query = query.order("name", { ascending: true });
        let result = await query;
        if (result.error) result = await supabaseClient.from(table).select("*");
        return result;
    };

    try {

        const [categoryResult, itemResult, subResult] = await Promise.all([
            fetchTable("categories", false),
            fetchTable("food_items", true),
            fetchTable("subcategories", false)
        ]);

        if (categoryResult.error) throw categoryResult.error;
        if (itemResult.error) throw itemResult.error;

        const subcategories = subResult.error ? [] : (subResult.data || []);
        const subById = new Map(subcategories.map(sub => [sub.id, sub]));

        const categories = (categoryResult.data || []).filter(row =>
            firstValue(row, ["is_active", "active"], true) !== false
        );

        const items = (itemResult.data || []).filter(row => {
            if (firstValue(row, ["is_active", "active"], true) === false) return false;
            if (firstValue(row, ["is_available", "available"], true) === false) return false;
            const sub = subById.get(row.subcategory_id);
            return !(sub && sub.is_active === false);
        });

        menuData = categories.map(category => {

            const categoryId = firstValue(category, ["id", "category_id"]);
            const categoryName = firstValue(category, ["name", "category_name", "title"], "Menu");
            const categorySlug = firstValue(category, ["slug", "name", "category_name"], categoryName);

            const categoryItems = items
                .filter(item => firstValue(item, ["category_id", "categoryId"]) === categoryId)
                .map(item => {
                    const sub = subById.get(item.subcategory_id);
                    return {
                        id: firstValue(item, ["id", "food_item_id"]),
                        name: firstValue(item, ["name", "item_name", "title"], "Food item"),
                        price: Number(firstValue(item, ["price", "selling_price", "unit_price"], 0)),
                        imageUrl: safeUrl(firstValue(item, ["image_url", "image", "photo_url"], null)),
                        description: firstValue(item, ["description", "details"], ""),
                        subcategoryName: sub ? sub.name : "",
                        subcategorySort: sub ? Number(sub.sort_order) || 0 : -1
                    };
                })
                .filter(item => item.id && Number.isFinite(item.price))
                .sort((a, b) => a.subcategorySort - b.subcategorySort);

            return {
                id: categoryId,
                name: categoryName,
                emoji: categoryEmoji(categorySlug),
                description: firstValue(category, ["description"], "Freshly prepared favourites"),
                cover: safeUrl(firstValue(category, ["image_url", "cover_image_url", "image"], "")) || "",
                items: categoryItems
            };

        }).filter(category => category.id && category.items.length > 0);

        if (!menuData.length) {
            menuFailed = false;
            menuLoaded = true;
            if (categoryGrid) categoryGrid.innerHTML = '<p class="form-note">No menu items are available right now. Please check again later.</p>';
            cart = {};
            saveCart();
            updateCartCount();
            refreshCartIfOpen();
            return;
        }

        /* Drop saved cart lines for items that no longer exist. */
        const validIds = new Set(getAllItems().map(item => item.id));
        cart = Object.fromEntries(Object.entries(cart).filter(([id, quantity]) => validIds.has(id) && Number(quantity) > 0));
        saveCart();

        menuLoaded = true;

        renderCategories();
        updateCartCount();

        if (history.state && history.state.view === "menu" && history.state.category) {
            const activeCategory = getCategoryById(history.state.category);
            if (activeCategory) renderProducts(activeCategory);
        }

        refreshCartIfOpen();

    } catch (error) {

        console.error("Could not load menu from Supabase:", error);

        menuFailed = true;
        showMenuError("The menu could not be loaded. Please check your connection and try again.");
        showToast("Could not load the menu. Please try again.");
        refreshCartIfOpen();

    }

}

function refreshCartIfOpen() {
    if (history.state && history.state.view === "cart") renderCart();
}


/* =========================================================
   LOAD GALLERY FROM SUPABASE (falls back to the built-in photos)
   ========================================================= */

async function loadGalleryFromSupabase() {

    const grid = document.getElementById("galleryGrid");

    if (!grid || !supabaseClient) return;

    try {

        let result = await supabaseClient.from("gallery_images").select("*").order("sort_order", { ascending: true });

        if (result.error) throw result.error;

        const rows = (result.data || []).filter(row => row.is_active !== false && safeUrl(row.image_url));

        if (!rows.length) return;

        grid.innerHTML = rows.map(row => {

            const title = escapeHTML(row.title || "Achaas Cafe");

            return `<div class="gallery-card">
                <img src="${escapeHTML(safeUrl(row.image_url))}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-photo')">
                <div class="photo-placeholder">Photo</div>
                <div class="gallery-caption">${title}</div>
            </div>`;

        }).join("");

    } catch (error) {

        console.warn("Could not load gallery images. Showing the built-in gallery.", error);

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
            onclick="openCategory('${escapeHTML(category.id)}')">

            ${category.cover
                ? `<img src="${escapeHTML(category.cover)}" alt="" class="category-image" loading="lazy">`
                : `<div class="category-image-fallback">${category.emoji}</div>`}

            <div class="category-info">
                <h3>${escapeHTML(category.name)}</h3>
                <p>${category.items.length} food item${category.items.length === 1 ? "" : "s"}</p>
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

    let lastSubcategory = "";

    container.innerHTML = category.items.map(item => {

        let heading = "";

        if (item.subcategoryName !== lastSubcategory) {
            if (item.subcategoryName) {
                heading = `<h2 class="subcategory-heading">${escapeHTML(item.subcategoryName)}</h2>`;
            }
            lastSubcategory = item.subcategoryName;
        }

        const id = escapeHTML(item.id);

        return heading + `

        <article class="product-card" data-product="${id}">

            <div class="product-photo-area">
                <div class="product-main-photo" data-gallery="${id}">
                    <img src="${escapeHTML(getImagePath(item.id, 1))}"
                         alt="${escapeHTML(item.name)}"
                         loading="lazy"
                         decoding="async"
                         data-main-image="${id}">
                </div>
            </div>

            <div class="product-info">

                <div class="product-title-row">
                    <h3>${escapeHTML(item.name)}</h3>
                    <span class="product-price">${formatPrice(item.price)}</span>
                </div>

                ${item.description ? `<p class="product-description">${escapeHTML(item.description)}</p>` : ""}

                <div class="product-controls">

                    <div class="qty-control">
                        <button type="button" aria-label="Decrease quantity"
                                onclick="changeProductQuantity('${id}', -1)">−</button>
                        <span id="quantity-${id}" aria-live="polite">1</span>
                        <button type="button" aria-label="Increase quantity"
                                onclick="changeProductQuantity('${id}', 1)">+</button>
                    </div>

                    <button type="button" class="btn btn-primary btn-small"
                            onclick="addToCart('${id}')">
                        Add to Cart
                    </button>

                </div>

            </div>

        </article>`;

    }).join("");

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





/* Swipe functionality */



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


    quantity = Math.min(99, Math.max(1, quantity));


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
    
    clearAppliedCoupon();


    const quantity = Math.max(

        1,

        Number(quantityElement.textContent) || 1

    );


    /* Add quantity to the existing cart item */

    cart[itemId] = Math.min(99, (cart[itemId] || 0) + quantity);

    quantityElement.textContent = "1";


    saveCart();

    updateCartCount();


    showToast(

        item.name + " added (" + cart[itemId] + " in cart)"

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

    return Math.max(
        0,
        getSubtotal() -
        appliedCouponDiscount +
        CAFE.deliveryCharge
    );

}





function clearAppliedCoupon() {

    appliedCouponCode = "";
    appliedCouponDiscount = 0;

    const message = document.getElementById("couponMessage");

    if (message) {
        message.textContent = "Cart updated. Apply your coupon again.";
    }

}



/* =========================================================
   CUSTOMER COUPON VALIDATION
   ========================================================= */

async function applyCoupon() {

    const input = document.getElementById("couponCode");
    const message = document.getElementById("couponMessage");
    const button = document.getElementById("applyCouponButton");

    if (!input || !message || !button) return;

    const couponCode = input.value.trim().toUpperCase();

    if (!couponCode) {
        message.textContent = "Please enter a coupon code.";
        return;
    }

    if (Object.keys(cart).length === 0) {
        message.textContent = "Your cart is empty.";
        return;
    }

    const orderItems = Object.entries(cart).map(([foodItemId, quantity]) => ({
        foodItemId,
        quantity: Number(quantity)
    }));

    button.disabled = true;
    button.textContent = "Checking...";
    message.textContent = "";

    try {

        const response = await fetch(ORDER_FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify({
                action: "validate_coupon",
                couponCode,
                items: orderItems
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success !== true) {
            throw new Error(
                result.error || "Could not apply this coupon."
            );
        }

        appliedCouponCode = result.couponCode;
        appliedCouponDiscount = Number(result.discountAmount) || 0;

        renderCart();

        const updatedMessage = document.getElementById("couponMessage");

        if (updatedMessage) {
            updatedMessage.textContent =
                "✓ Coupon applied! You saved " +
                formatPrice(appliedCouponDiscount) + ".";
        }

} catch (error) {

    appliedCouponCode = "";
    appliedCouponDiscount = 0;

    console.error("Coupon validation failed:", error);

    try {
        renderCart();
    } catch (renderError) {
        console.error("Cart refresh failed:", renderError);
    }

    const updatedMessage = document.getElementById("couponMessage");

    if (updatedMessage) {
        updatedMessage.textContent =
            error.message || "Could not validate the coupon.";
    }

}

    finally {

        button.disabled = false;
        button.textContent = "Apply";

    }

}



/* =========================================================
   16. SHOPPING CART DISPLAY
   ========================================================= */

function renderCart() {

    if (!menuLoaded) {

        ["emptyCart", "cartContent"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.classList.add("hidden");
        });

        const loading = document.getElementById("cartLoading");

        if (loading) {
            loading.textContent = menuFailed
                ? "We could not load the menu, so your cart cannot be shown yet. Please refresh the page."
                : "Loading your cart…";
            loading.classList.remove("hidden");
        }

        return;
    }

    const loadingNote = document.getElementById("cartLoading");
    if (loadingNote) loadingNote.classList.add("hidden");

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


                <img src="${escapeHTML(getImagePath(item.id, 1))}" alt="" class="cart-item-photo" loading="lazy" onerror="this.style.visibility='hidden'">


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
    
    
    const discountRow = document.getElementById("discountRow");
    const discountText = document.getElementById("couponDiscount");

    if (discountRow) {
        discountRow.style.display =
            appliedCouponDiscount > 0 ? "flex" : "none";
    }

    if (discountText) {
        discountText.textContent =
            "-" + formatPrice(appliedCouponDiscount);
    }



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
    
    clearAppliedCoupon();


    cart[itemId] = Math.min(99, cart[itemId] + difference);


    if (cart[itemId] <= 0) {

        delete cart[itemId];

    }


    saveCart();

    renderCart();

}


function removeCartItem(itemId) {

clearAppliedCoupon();

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

    const rememberBox = document.getElementById("rememberDetails");

    if (rememberBox) rememberBox.checked = readStorage(REMEMBER_STORAGE_KEY, true) !== false;

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
   21. SAVE CUSTOMER INFORMATION
   ========================================================= */

function saveCurrentCustomerDetails() {

    const remember = document.getElementById("rememberDetails");

    if (remember && !remember.checked) {
        customerData = {};
        removeStorage(CUSTOMER_STORAGE_KEY);
        saveStorage(REMEMBER_STORAGE_KEY, false);
        return;
    }

    saveStorage(REMEMBER_STORAGE_KEY, true);

    customerData = collectCustomerData();

    saveCustomerData();

}


/* =========================================================
   22. CREATE WHATSAPP ORDER MESSAGE
   ========================================================= */




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

let orderInFlight = false;

async function placeWebsiteOrder() {

    if (orderInFlight) return;

    if (!menuLoaded) {
        showToast("The menu is still loading. Please wait a moment.");
        return;
    }

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

    const orderButton = document.getElementById("placeOrderButton");

    orderInFlight = true;

    if (orderButton) {
        orderButton.disabled = true;
        orderButton.textContent = "Submitting...";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {

        const response = await fetch(ORDER_FUNCTION_URL, {
            method: "POST",
            headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_PUBLISHABLE_KEY
},
            signal: controller.signal,
            body: JSON.stringify({
                customerName: details.name,
                customerPhone: details.phone,
                customerAddress: details.address,
                         
preferences: details.preferences,
instructions: details.instructions,
items: orderItems,
couponCode: appliedCouponCode

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

        cart = {};
        checkoutExpanded = false;
        
        
        appliedCouponCode = "";
appliedCouponDiscount = 0;

const couponInput = document.getElementById("couponCode");
if (couponInput) couponInput.value = "";

const couponMessage = document.getElementById("couponMessage");
if (couponMessage) couponMessage.textContent = "";

        saveCart();

        const form = document.getElementById("customerForm");
        if (form) form.reset();

        /* Keep the customer's details for next time only if they chose to. */
        const remember = readStorage(REMEMBER_STORAGE_KEY, true) !== false;
        if (!remember) { customerData = {}; removeStorage(CUSTOMER_STORAGE_KEY); }

        const checkoutPanel = document.getElementById("checkoutPanel");
        if (checkoutPanel) checkoutPanel.classList.add("hidden");

        const detailsButton = document.getElementById("detailsButton");
        if (detailsButton) detailsButton.textContent = "Add Your Details to Order";

        renderCart();

        if (successPanel) {
            successPanel.classList.remove("hidden");
            successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        showToast("Your order has been submitted successfully.");

    } catch (error) {

        console.error("Order submission error:", error);

        let message = error.message || "Could not submit your order. Please try again.";

        if (error.name === "AbortError") {
            message = "The request took too long. Please check your connection and try again.";
        } else if (error instanceof TypeError) {
            message = "No internet connection. Your cart is saved, so please try again.";
        }

        showToast(message);

    } finally {

        clearTimeout(timeout);
        orderInFlight = false;

        if (orderButton) {
            orderButton.disabled = false;
            orderButton.textContent = "Place Order";
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

    /* Remove data left by an older version of the site. */

    removeStorage("achaasCafePendingOrder");

    /* Open the page named in the address (#menu, #cart ...) and make it the history start. */

    const startState = stateFromHash();

    history.replaceState(startState, "", urlForState(startState));

    renderNavigationState(startState);

    /* Everything below loads in parallel; the cached theme is already applied. */

    loadCafeSettings();

    loadGalleryFromSupabase();

    loadMenuFromSupabase();

    updateCartCount();

    const year = document.getElementById("currentYear");

    if (year) year.textContent = new Date().getFullYear();

    attachCustomerAutoSave();

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
