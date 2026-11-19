/**
 * DY Autocolor - Vanilla ES6 Controller for Shopify Dawn
 * Handles: Smart FIN/Color Search, QR URL Params, 1-Click AJAX Cart, Variant Tier Switching
 */

const DY_PROTOTYPE_DB = {
  vins: {
    "WDD205":   { code: "197",  model: "Mercedes-Benz C-Klasse (W205)", hex: "#14171a", handle: "lackspray-400ml" },
    "WBA3":     { code: "475",  model: "BMW 3er Reihe (F30 / G20)",     hex: "#10141c", handle: "lackspray-400ml" },
    "WVWZZZAU": { code: "LC9X", model: "VW Golf VII (AU)",              hex: "#17181c", handle: "lackspray-400ml" }
  },
  codes: {
    "197":  { name: "Mercedes 197 Obsidianschwarz Met.", hex: "#14171a", handle: "lackspray-400ml" },
    "475":  { name: "BMW 475 Saphirschwarz Met.",        hex: "#10141c", handle: "lackspray-400ml" },
    "LC9X": { name: "VW LC9X Deep Black Perleffekt",     hex: "#17181c", handle: "lackspray-400ml" }
  }
};

function getShopifyRoot() {
  return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) ? window.Shopify.routes.root : "/";
}

// 1. Baymard "Search Forgiveness": Removes spaces, dashes, dots & common prefixes
function normalizePaintQuery(raw) {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/^(VW|AUDI|BMW|MB|MERCEDES|FARBCODE|CODE)\s*/i, "")
    .replace(/[\s\-_./]/g, "")
    .trim();
}

// 2. Smart Search Router: FIN -> Exact Paint Code -> Native Shopify Full-Text Search
function handleDySmartSearch(event) {
  if (event) event.preventDefault();
  const input = document.getElementById("dy-search-input");
  if (!input || !input.value.trim()) return;

  const rawQuery = input.value.trim();
  const clean = normalizePaintQuery(rawQuery);
  const root = getShopifyRoot();

  // A) Check VIN prefix match
  const matchedVinKey = Object.keys(DY_PROTOTYPE_DB.vins).find(prefix => clean.startsWith(prefix));
  if (matchedVinKey) {
    const hit = DY_PROTOTYPE_DB.vins[matchedVinKey];
    window.location.href = `${root}products/${hit.handle}?vin=${encodeURIComponent(clean)}&code=${encodeURIComponent(hit.code)}&model=${encodeURIComponent(hit.model)}`;
    return;
  }

  // B) Check exact paint code match
  if (DY_PROTOTYPE_DB.codes[clean]) {
    const hit = DY_PROTOTYPE_DB.codes[clean];
    window.location.href = `${root}products/${hit.handle}?code=${encodeURIComponent(clean)}`;
    return;
  }

  // C) Fallback to native Shopify search (for "Klarlack", "Füller", "EUROLUX", etc.)
  window.location.href = `${root}search?q=${encodeURIComponent(rawQuery)}&options%5Bprefix%5D=last`;
}

// Helper for the quick-search chips under the search bar
function dyQuickSearch(term) {
  const input = document.getElementById("dy-search-input");
  if (input) {
    input.value = term;
    handleDySmartSearch();
  }
}

// 3. McMaster-Carr 1-Click AJAX Cart (/cart/add.js)
async function dyAddToCartAjax(variantId, quantity = 1, properties = {}, buttonEl = null) {
  const originalText = buttonEl ? buttonEl.innerHTML : "";
  const root = getShopifyRoot();

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = "Wird hinzugefügt...";
  }

  try {
    const response = await fetch(root + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        items: [{
          id: Number(variantId),
          quantity: Number(quantity),
          properties: properties
        }]
      })
    });

    if (!response.ok) throw new Error("Shopify Cart API Error");

    const cartRes = await fetch(root + "cart.js");
    const cartData = await cartRes.json();
    const badge = document.getElementById("dy-cart-count");
    if (badge) badge.textContent = cartData.item_count;

    if (buttonEl) {
      buttonEl.style.backgroundColor = "#1b8a44";
      buttonEl.textContent = "✓ Im Warenkorb (" + cartData.item_count + ")";
      setTimeout(() => {
        buttonEl.disabled = false;
        buttonEl.style.backgroundColor = "";
        buttonEl.innerHTML = originalText;
      }, 1800);
    }
  } catch (err) {
    console.error(err);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = "Fehler – Erneut versuchen";
    }
  }
}

// 4. Product Page Variant / Tier Switcher (safe data-attribute binding)
function selectDyVariant(buttonEl) {
  const variantId = buttonEl.getAttribute("data-variant-id");
  const grossPrice = buttonEl.getAttribute("data-price");
  const netPrice = buttonEl.getAttribute("data-net-price");
  const unitInfo = buttonEl.getAttribute("data-unit-info");
  const sku = buttonEl.getAttribute("data-sku");

  const idInput = document.getElementById("dy-variant-id");
  const grossEl = document.getElementById("dy-price-gross");
  const netEl = document.getElementById("dy-price-net");
  const skuEl = document.getElementById("dy-variant-sku");

  if (idInput && variantId) idInput.value = variantId;
  if (grossEl && grossPrice) grossEl.textContent = grossPrice;
  if (netEl && netPrice) {
    netEl.textContent = unitInfo
      ? `Preis exkl. MwSt.: ${netPrice} | [${unitInfo}]`
      : `Preis exkl. MwSt.: ${netPrice}`;
  }
  if (skuEl && sku) skuEl.textContent = sku;

  document.querySelectorAll(".tier-btn").forEach(btn => btn.classList.remove("active"));
  buttonEl.classList.add("active");
}

// 5. QR-Code & URL-Parameter Reader on Product Pages (?code=197&vin=WDD205...)
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get("code");
  const urlVin = params.get("vin");
  const urlModel = params.get("model");

  const codeInput = document.getElementById("dy-prop-colorcode");
  const vinInput = document.getElementById("dy-prop-vin");
  const carStage = document.getElementById("dy-vehicle-stage");
  const neutralStage = document.getElementById("dy-neutral-stage");
  const carBodySvg = document.getElementById("dy-svg-car-body");
  const modelBanner = document.getElementById("dy-detected-model-banner");

  if (urlCode && codeInput) {
    const cleanCode = normalizePaintQuery(urlCode);
    codeInput.value = cleanCode;
    const known = DY_PROTOTYPE_DB.codes[cleanCode];
    if (known) {
      if (carBodySvg) carBodySvg.setAttribute("fill", known.hex);
      const swatch = document.getElementById("dy-neutral-swatch");
      if (swatch) swatch.style.backgroundColor = known.hex;
    }
  }

  // Conditional Vehicle Preview: Only auto-shows when a VIN or vehicle model is present
  if ((urlVin || urlModel) && carStage && neutralStage) {
    if (vinInput && urlVin) vinInput.value = urlVin;
    neutralStage.style.display = "none";
    carStage.style.display = "block";
    if (modelBanner) {
      modelBanner.textContent = urlVin
        ? `✓ FIN (${urlVin.substring(0, 8)}...) erkannt: ${urlModel || "Passendes Fahrzeugmodell"}`
        : `✓ Fahrzeugmodell: ${urlModel}`;
    }
  }
});
