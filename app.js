const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

let allCards = [];
let isUpdating = false;

async function fetchCards() {
  const status = document.getElementById("statusMessage");

  try {
    status.textContent = "Loading cards...";

    const url = new URL(API_URL);
    url.searchParams.set("mode", "read");
    url.searchParams.set("t", String(Date.now()));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();

    if (Array.isArray(payload)) {
      allCards = payload;
    } else if (payload && payload.success && Array.isArray(payload.data)) {
      allCards = payload.data;
    } else {
      throw new Error(payload.message || "Invalid read response");
    }

    populateFilters();
    render();

    status.textContent = `${allCards.length} card variants loaded`;
  } catch (error) {
    console.error(error);
    status.textContent = `Failed to load card data: ${error.message}`;
    document.getElementById("results").innerHTML =
      `<div class="empty-state">Could not load card data.</div>`;
  }
}

function populateFilters() {
  const ownerFilter = document.getElementById("ownerFilter");
  const setFilter = document.getElementById("setFilter");

  const currentOwner = ownerFilter.value || "All";
  const currentSet = setFilter.value || "All";

  const visibleCards = allCards.filter(card => card.Exists !== false);

  const owners = [...new Set(visibleCards.map(card => card.Owner).filter(Boolean))].sort();
  const sets = [...new Set(visibleCards.map(card => card.Set).filter(Boolean))].sort();

  ownerFilter.innerHTML = `<option value="All">All Owners</option>`;
  setFilter.innerHTML = `<option value="All">All Sets</option>`;

  owners.forEach(owner => {
    ownerFilter.innerHTML += `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`;
  });

  sets.forEach(setName => {
    setFilter.innerHTML += `<option value="${escapeHtml(setName)}">${escapeHtml(setName)}</option>`;
  });

  ownerFilter.value = owners.includes(currentOwner) ? currentOwner : "All";
  setFilter.value = sets.includes(currentSet) ? currentSet : "All";
}

function render() {
  const results = document.getElementById("results");
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const owner = document.getElementById("ownerFilter").value;
  const setName = document.getElementById("setFilter").value;
  const missingFilter = document.getElementById("missingFilter").value;
  const sortMode = document.getElementById("sortSelect").value;

  const visibleCards = allCards.filter(card => {
    const pokemon = String(card.Pokemon || "").toLowerCase();
    const cardNumber = String(card.CardNumber || "").toLowerCase();
    const variant = String(card.Variant || "").toLowerCase();
    const exists = card.Exists !== false;

    return (
      exists &&
      (!search ||
        pokemon.includes(search) ||
        cardNumber.includes(search) ||
        variant.includes(search)) &&
      (owner === "All" || card.Owner === owner) &&
      (setName === "All" || card.Set === setName)
    );
  });

  const grouped = {};

  visibleCards.forEach(card => {
    const key = `${card.Owner}|${card.Set}|${card.CardNumber}|${card.Pokemon}`;

    if (!grouped[key]) {
      grouped[key] = {
        Owner: card.Owner,
        Set: card.Set,
        CardNumber: card.CardNumber,
        Pokemon: card.Pokemon,
        variants: []
      };
    }

    grouped[key].variants.push(card);
  });

  const variantOrder = [
    "Normal",
    "Holo",
    "Rev Holo",
    "Poke BP",
    "Master BP",
    "DR Holo",
    "IR",
    "UR",
    "SIR",
    "BWR"
  ];

  let groups = Object.values(grouped);

  // Actual missing filter, not fake sorting
  if (missingFilter !== "All") {
    groups = groups.filter(group => {
      return hasMissingVariant(group.variants, missingFilter);
    });
  }

  if (!groups.length) {
    results.innerHTML = `<div class="empty-state">No matching cards found.</div>`;
    return;
  }

  if (sortMode === "alpha") {
    groups.sort((a, b) => {
      const nameCompare = String(a.Pokemon).localeCompare(String(b.Pokemon));
      if (nameCompare !== 0) return nameCompare;
      return compareCardNumbers(a.CardNumber, b.CardNumber);
    });
  } else {
    groups.sort((a, b) => {
      const numCompare = compareCardNumbers(a.CardNumber, b.CardNumber);
      if (numCompare !== 0) return numCompare;
      return String(a.Pokemon).localeCompare(String(b.Pokemon));
    });
  }

  results.innerHTML = groups.map(group => {
    const ownerSafe = escapeHtml(group.Owner || "");
    const setSafe = escapeHtml(group.Set || "");
    const cardNumberSafe = escapeHtml(String(group.CardNumber || ""));
    const pokemonSafe = escapeHtml(group.Pokemon || "Unknown");

    group.variants.sort((a, b) => {
      return variantOrder.indexOf(a.Variant) - variantOrder.indexOf(b.Variant);
    });

    const variantsHtml = group.variants.map(variantCard => {
      const owned = variantCard.Owned === true;
      const exists = variantCard.Exists !== false;
      const isTargetMissing = missingFilter !== "All" &&
        variantCard.Variant === missingFilter &&
        exists &&
        !owned;

      if (!exists) {
        return `<span class="variant-btn unavailable">${escapeHtml(variantCard.Variant || "Unknown")}</span>`;
      }

      return `
        <button
          class="variant-btn ${owned ? "owned" : "missing"} ${isTargetMissing ? "target-missing" : ""}"
          onclick="toggleOwned('${jsEscape(variantCard.Owner)}','${jsEscape(variantCard.Set)}','${jsEscape(String(variantCard.CardNumber))}','${jsEscape(variantCard.Variant)}', ${owned}, ${exists})"
          ${isUpdating ? "disabled" : ""}
        >
          ${escapeHtml(variantCard.Variant || "Unknown")}
        </button>
      `;
    }).join("");

    return `
      <div class="row-card">
        <div class="row-header">
          <div>
            <div class="pokemon-name">${pokemonSafe}</div>
            <div class="sub">#${cardNumberSafe} • ${setSafe} • ${ownerSafe}</div>
          </div>
        </div>
        <div class="variant-row">${variantsHtml}</div>
      </div>
    `;
  }).join("");
}

function hasMissingVariant(variants, targetVariant) {
  return variants.some(variantCard => {
    return (
      variantCard.Exists !== false &&
      variantCard.Variant === targetVariant &&
      variantCard.Owned !== true
    );
  });
}

async function toggleOwned(owner, setName, cardNumber, variant, currentOwned, exists) {
  if (isUpdating || !exists) return;

  isUpdating = true;
  const status = document.getElementById("statusMessage");
  status.textContent = "Saving change...";

  try {
    const url = new URL(API_URL);
    url.searchParams.set("mode", "update");
    url.searchParams.set("owner", owner);
    url.searchParams.set("setName", setName);
    url.searchParams.set("cardNumber", cardNumber);
    url.searchParams.set("variant", variant);
    url.searchParams.set("owned", String(!currentOwned));
    url.searchParams.set("t", String(Date.now()));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || "Update failed");
    }

    const match = allCards.find(card =>
      card.Owner === owner &&
      card.Set === setName &&
      String(card.CardNumber) === String(cardNumber) &&
      card.Variant === variant
    );

    if (match) {
      match.Owned = !currentOwned;
    }

    render();
    status.textContent = "Card updated";

    setTimeout(fetchCards, 500);
  } catch (error) {
    console.error(error);
    status.textContent = `Save failed: ${error.message}`;
  } finally {
    isUpdating = false;
  }
}

function compareCardNumbers(a, b) {
  const aParts = parseCardNumber(a);
  const bParts = parseCardNumber(b);

  if (aParts.main !== bParts.main) {
    return aParts.main - bParts.main;
  }

  return aParts.total - bParts.total;
}

function parseCardNumber(value) {
  const str = String(value || "").trim();
  const parts = str.split("/");

  if (parts.length === 2) {
    return {
      main: parseInt(parts[0], 10) || 0,
      total: parseInt(parts[1], 10) || 0
    };
  }

  return {
    main: parseInt(str, 10) || 0,
    total: 0
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsEscape(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("ownerFilter").addEventListener("change", render);
document.getElementById("setFilter").addEventListener("change", render);
document.getElementById("missingFilter").addEventListener("change", render);
document.getElementById("sortSelect").addEventListener("change", render);

fetchCards();
setInterval(fetchCards, 30000);
