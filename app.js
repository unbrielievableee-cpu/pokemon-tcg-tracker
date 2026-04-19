const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

let allCards = [];
let isUpdating = false;

async function fetchCards() {
  const status = document.getElementById("statusMessage");

  try {
    status.textContent = "Loading cards...";

    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    allCards = Array.isArray(data) ? data : [];

    populateFilters();
    render();

    status.textContent = `${allCards.length} card variants loaded`;
  } catch (error) {
    console.error(error);
    status.textContent = "Failed to load card data";
    document.getElementById("results").innerHTML =
      `<div class="empty-state">Could not load card data.</div>`;
  }
}

function populateFilters() {
  const ownerFilter = document.getElementById("ownerFilter");
  const setFilter = document.getElementById("setFilter");

  const currentOwner = ownerFilter.value || "All";
  const currentSet = setFilter.value || "All";

  const owners = [...new Set(allCards.map(c => c.Owner).filter(Boolean))].sort();
  const sets = [...new Set(allCards.map(c => c.Set).filter(Boolean))].sort();

  ownerFilter.innerHTML = `<option value="All">All Owners</option>`;
  setFilter.innerHTML = `<option value="All">All Sets</option>`;

  owners.forEach(owner => {
    ownerFilter.innerHTML += `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`;
  });

  sets.forEach(set => {
    setFilter.innerHTML += `<option value="${escapeHtml(set)}">${escapeHtml(set)}</option>`;
  });

  ownerFilter.value = owners.includes(currentOwner) ? currentOwner : "All";
  setFilter.value = sets.includes(currentSet) ? currentSet : "All";
}

function render() {
  const results = document.getElementById("results");
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const owner = document.getElementById("ownerFilter").value;
  const set = document.getElementById("setFilter").value;

  const filtered = allCards.filter(c => {
    const pokemon = String(c.Pokemon || "").toLowerCase();
    const cardNumber = String(c.CardNumber || "").toLowerCase();
    const variant = String(c.Variant || "").toLowerCase();

    return (
      (!search ||
        pokemon.includes(search) ||
        cardNumber.includes(search) ||
        variant.includes(search)) &&
      (owner === "All" || c.Owner === owner) &&
      (set === "All" || c.Set === set)
    );
  });

  if (!filtered.length) {
    results.innerHTML = `<div class="empty-state">No matching cards found.</div>`;
    return;
  }

  const grouped = {};

  filtered.forEach(c => {
    const key = `${c.Owner}|${c.Set}|${c.CardNumber}|${c.Pokemon}`;

    if (!grouped[key]) {
      grouped[key] = {
        Owner: c.Owner,
        Set: c.Set,
        CardNumber: c.CardNumber,
        Pokemon: c.Pokemon,
        variants: []
      };
    }

    grouped[key].variants.push(c);
  });

  const groups = Object.values(grouped).sort((a, b) => {
    const nameCompare = String(a.Pokemon).localeCompare(String(b.Pokemon));
    if (nameCompare !== 0) return nameCompare;
    return String(a.CardNumber).localeCompare(String(b.CardNumber));
  });

  results.innerHTML = groups.map(group => {
    const ownerSafe = escapeHtml(group.Owner || "");
    const setSafe = escapeHtml(group.Set || "");
    const cardNumberSafe = escapeHtml(String(group.CardNumber || ""));
    const pokemonSafe = escapeHtml(group.Pokemon || "Unknown");

    const variantsHtml = group.variants.map(v => {
      const owned = v.Owned === true;

      return `
        <button
          class="variant-btn ${owned ? "owned" : ""}"
          onclick="toggleOwned('${jsEscape(v.Owner)}','${jsEscape(v.Set)}','${jsEscape(String(v.CardNumber))}','${jsEscape(v.Variant)}', ${owned})"
          ${isUpdating ? "disabled" : ""}
          title="${owned ? "Click to mark missing" : "Click to mark owned"}"
        >
          ${escapeHtml(v.Variant || "Unknown")}
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

        <div class="variant-row">
          ${variantsHtml}
        </div>
      </div>
    `;
  }).join("");
}

async function toggleOwned(owner, set, cardNumber, variant, currentOwned) {
  if (isUpdating) return;

  isUpdating = true;
  const status = document.getElementById("statusMessage");
  status.textContent = "Saving change...";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        owner,
        set,
        cardNumber,
        variant,
        owned: !currentOwned
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || "Update failed");
    }

    const match = allCards.find(c =>
      c.Owner === owner &&
      c.Set === set &&
      String(c.CardNumber) === String(cardNumber) &&
      c.Variant === variant
    );

    if (match) {
      match.Owned = !currentOwned;
    }

    render();
    status.textContent = "Card updated";
  } catch (error) {
    console.error(error);
    status.textContent = `Save failed: ${error.message}`;
  } finally {
    isUpdating = false;
  }
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

fetchCards();
setInterval(fetchCards, 30000);
