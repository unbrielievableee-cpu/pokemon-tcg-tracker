const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

const OWNER = "Brie";

let allCards = [];
let originalOwnedState = new Map();
let pendingUpdates = new Map();
let isBatchSaving = false;

async function fetchCards() {
  const status = document.getElementById("statusMessage");

  try {
    status.textContent = "Loading cards...";

    const url = new URL(API_URL);
    url.searchParams.set("mode", "read");
    url.searchParams.set("t", String(Date.now()));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();

    if (Array.isArray(payload)) {
      allCards = payload.filter(card => card.Owner === OWNER);
    } else if (payload && payload.success && Array.isArray(payload.data)) {
      allCards = payload.data.filter(card => card.Owner === OWNER);
    } else {
      throw new Error(payload.message || "Invalid read response");
    }

    rebuildOriginalOwnedState();
    pendingUpdates.clear();

    populateSetFilter();
    populateMissingFilter();
    render();
  } catch (error) {
    console.error(error);
    status.textContent = `Failed to load card data: ${error.message}`;
    document.getElementById("results").innerHTML =
      `<div class="empty-state">Could not load card data.</div>`;
  }
}

function rebuildOriginalOwnedState() {
  originalOwnedState.clear();

  allCards.forEach(card => {
    const key = makeUpdateKey(
      card.Owner,
      card.Set,
      card.CardNumber,
      card.Variant
    );

    originalOwnedState.set(key, card.Owned === true);
  });
}

function populateSetFilter() {
  const setFilter = document.getElementById("setFilter");
  const currentSet = setFilter.value || "All";

  const visibleCards = allCards.filter(card => card.Exists !== false);
  const sets = [...new Set(visibleCards.map(card => card.Set).filter(Boolean))].sort();

  setFilter.innerHTML = `<option value="All">All Sets</option>`;

  sets.forEach(setName => {
    setFilter.innerHTML += `<option value="${escapeHtml(setName)}">${escapeHtml(setName)}</option>`;
  });

  setFilter.value = sets.includes(currentSet) ? currentSet : "All";
}

function populateMissingFilter() {
  const missingFilter = document.getElementById("missingFilter");
  const setName = document.getElementById("setFilter").value;
  const currentMissing = missingFilter.value || "All";

  const cardsForContext = allCards.filter(card => {
    return (
      card.Exists !== false &&
      (setName === "All" || card.Set === setName)
    );
  });

  const variants = [...new Set(cardsForContext.map(card => card.Variant).filter(Boolean))];
  const variantOrder = getVariantOrderForSet(setName);

  variants.sort((a, b) => {
    const aIndex = variantOrder.indexOf(a);
    const bIndex = variantOrder.indexOf(b);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    return String(a).localeCompare(String(b));
  });

  missingFilter.innerHTML = `<option value="All">All Cards</option>`;

  variants.forEach(variant => {
    missingFilter.innerHTML += `<option value="${escapeHtml(variant)}">Missing ${escapeHtml(variant)}</option>`;
  });

  missingFilter.value = variants.includes(currentMissing) ? currentMissing : "All";
}

function render() {
  const results = document.getElementById("results");
  const status = document.getElementById("statusMessage");

  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const setName = document.getElementById("setFilter").value;
  const missingFilter = document.getElementById("missingFilter").value;
  const sortMode = document.getElementById("sortSelect").value;

  const isNumberSearch = /^\d+$/.test(search);

  const visibleCards = allCards.filter(card => {
    const pokemon = String(card.Pokemon || "").toLowerCase();
    const cardNumber = String(card.CardNumber || "").toLowerCase();
    const variant = String(card.Variant || "").toLowerCase();

    return (
      card.Exists !== false &&
      (!search ||
        (isNumberSearch
          ? cardNumber.startsWith(search)
          : pokemon.includes(search) || variant.includes(search))) &&
      (setName === "All" || card.Set === setName)
    );
  });

  const grouped = {};

  visibleCards.forEach(card => {
    const key = `${card.Set}|${card.CardNumber}|${card.Pokemon}`;

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

  let groups = Object.values(grouped);

  if (missingFilter !== "All") {
    groups = groups.filter(group => hasMissingVariant(group.variants, missingFilter));
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

  updateSaveButton();

  const cardCount = groups.length;
  const variantCount = groups.reduce((sum, group) => sum + group.variants.length, 0);
  const ownedCount = visibleCards.filter(card => card.Owned === true).length;
  const totalCount = visibleCards.length;
  const pendingCount = pendingUpdates.size;

  status.textContent = pendingCount
    ? `${cardCount} cards (${ownedCount} of ${totalCount} variants owned) • ${pendingCount} unsaved change${pendingCount === 1 ? "" : "s"}`
    : `${cardCount} cards (${ownedCount} of ${totalCount} variants owned)`;

  if (!groups.length) {
    results.innerHTML = `<div class="empty-state">No matching cards found.</div>`;
    return;
  }

  results.innerHTML = groups.map(group => {
    const setSafe = escapeHtml(group.Set || "");
    const cardNumberSafe = escapeHtml(String(group.CardNumber || ""));
    const pokemonSafe = escapeHtml(group.Pokemon || "Unknown");
    const variantOrder = getVariantOrderForSet(group.Set);

    group.variants.sort((a, b) => {
      const aIndex = variantOrder.indexOf(a.Variant);
      const bIndex = variantOrder.indexOf(b.Variant);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return String(a.Variant).localeCompare(String(b.Variant));
    });

    const ownedInGroup = group.variants.filter(card => card.Owned === true).length;
    const totalInGroup = group.variants.length;
    const progressPercent = totalInGroup ? (ownedInGroup / totalInGroup) * 100 : 0;

    const variantsHtml = group.variants.map(variantCard => {
      const owned = variantCard.Owned === true;
      const exists = variantCard.Exists !== false;

      const key = makeUpdateKey(
        variantCard.Owner,
        variantCard.Set,
        variantCard.CardNumber,
        variantCard.Variant
      );

      const isPending = pendingUpdates.has(key);

      const isTargetMissing =
        missingFilter !== "All" &&
        variantCard.Variant === missingFilter &&
        exists &&
        !owned;

      if (!exists) {
        return `<span class="variant-btn unavailable">${escapeHtml(variantCard.Variant || "Unknown")}</span>`;
      }

      return `
        <button
          class="variant-btn ${owned ? "owned" : "missing"} ${isTargetMissing ? "target-missing" : ""} ${isPending ? "pending" : ""}"
          onclick="queueToggle('${jsEscape(variantCard.Set)}','${jsEscape(String(variantCard.CardNumber))}','${jsEscape(variantCard.Variant)}')"
        >
          ${escapeHtml(variantCard.Variant || "Unknown")}${isPending ? " •" : ""}
        </button>
      `;
    }).join("");

    return `
      <div class="row-card">
        <div class="row-header">
          <div>
            <div class="pokemon-name">${pokemonSafe}</div>
            <div class="sub">#${cardNumberSafe} • ${setSafe}</div>
          </div>
          <div class="card-progress-label">${ownedInGroup}/${totalInGroup}</div>
        </div>

        <div class="variant-row">${variantsHtml}</div>

        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function queueToggle(setName, cardNumber, variant) {
  if (isBatchSaving) return;

  const match = allCards.find(card =>
    card.Owner === OWNER &&
    card.Set === setName &&
    String(card.CardNumber) === String(cardNumber) &&
    card.Variant === variant
  );

  if (!match || match.Exists === false) return;

  const key = makeUpdateKey(OWNER, setName, cardNumber, variant);
  const originalOwned = originalOwnedState.get(key) === true;
  const newOwned = !(match.Owned === true);

  match.Owned = newOwned;

  if (newOwned === originalOwned) {
    pendingUpdates.delete(key);
  } else {
    pendingUpdates.set(key, {
      owner: OWNER,
      setName,
      cardNumber,
      variant,
      owned: newOwned
    });
  }

  render();
}

async function savePendingUpdates() {
  if (isBatchSaving || pendingUpdates.size === 0) return;

  isBatchSaving = true;
  updateSaveButton();

  const status = document.getElementById("statusMessage");
  const updates = Array.from(pendingUpdates.values());

  status.textContent = `Saving ${updates.length} update${updates.length === 1 ? "" : "s"}...`;

  try {
    const url = new URL(API_URL);
    url.searchParams.set("mode", "batchupdate");
    url.searchParams.set("updates", encodeURIComponent(JSON.stringify(updates)));
    url.searchParams.set("t", String(Date.now()));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const result = await res.json();

    if (!result.success) {
      console.error(result);
      throw new Error(result.message || "Batch update failed");
    }

    updates.forEach(update => {
      const key = makeUpdateKey(
        update.owner,
        update.setName,
        update.cardNumber,
        update.variant
      );

      originalOwnedState.set(key, update.owned === true);
    });

    pendingUpdates.clear();

    status.textContent = result.message || "Changes saved";
    render();
  } catch (error) {
    console.error(error);
    status.textContent = `Save failed: ${error.message}`;
  } finally {
    isBatchSaving = false;
    updateSaveButton();
    render();
  }
}

function updateSaveButton() {
  const saveButton = document.getElementById("saveButton");
  if (!saveButton) return;

  const count = pendingUpdates.size;

  if (isBatchSaving) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    return;
  }

  if (count === 0) {
    saveButton.disabled = true;
    saveButton.textContent = "Save Changes";
    return;
  }

  saveButton.disabled = false;
  saveButton.textContent = `Save ${count} Change${count === 1 ? "" : "s"}`;
}

function getVariantOrderForSet(setName) {
  const set = String(setName || "").toLowerCase();

  if (set === "surging sparks") {
    return [
      "Normal",
      "Holo",
      "Rev Holo",
      "DR - Holo",
      "ACE SPEC Rare",
      "IR",
      "UR",
      "SIR",
      "Hyper Rare"
    ];
  }

  return [
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

function makeUpdateKey(owner, setName, cardNumber, variant) {
  return `${owner}|${setName}|${cardNumber}|${variant}`;
}

function compareCardNumbers(a, b) {
  const aParts = parseCardNumber(a);
  const bParts = parseCardNumber(b);

  if (aParts.main !== bParts.main) return aParts.main - bParts.main;
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

document.getElementById("setFilter").addEventListener("change", () => {
  populateMissingFilter();
  render();
});

document.getElementById("missingFilter").addEventListener("change", render);
document.getElementById("sortSelect").addEventListener("change", render);
document.getElementById("saveButton").addEventListener("click", savePendingUpdates);

fetchCards();
