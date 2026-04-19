const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

let allCards = [];

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

  results.innerHTML = filtered.map(c => `
    <div class="card ${c.Owned ? "owned-true" : "owned-false"}">
      <h3>${escapeHtml(c.Pokemon || "Unknown")}</h3>
      <div class="card-number">#${escapeHtml(String(c.CardNumber || "-"))}</div>

      <div class="meta-row">
        <span class="pill">${escapeHtml(c.Variant || "Unknown Variant")}</span>
        <span class="pill">${escapeHtml(c.Set || "Unknown Set")}</span>
      </div>

      <div class="owner-line">Owner: ${escapeHtml(c.Owner || "Unknown")}</div>

      <div class="status">
        ${c.Owned ? "Owned" : "Missing"}
      </div>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("ownerFilter").addEventListener("change", render);
document.getElementById("setFilter").addEventListener("change", render);

fetchCards();
setInterval(fetchCards, 30000);
