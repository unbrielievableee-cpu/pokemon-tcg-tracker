const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

let allCards = [];
let isUpdating = false;

async function fetchCards() {
  const status = document.getElementById("statusMessage");

  try {
    status.textContent = "Loading cards...";

    const res = await fetch(API_URL + "?mode=read&t=" + Date.now());
    const payload = await res.json();

    allCards = payload.data || [];

    populateFilters();
    render();
  } catch (error) {
    console.error(error);
    status.textContent = "Failed to load";
  }
}

function populateFilters() {
  const ownerFilter = document.getElementById("ownerFilter");
  const setFilter = document.getElementById("setFilter");

  const owners = [...new Set(allCards.map(c => c.Owner))];
  const sets = [...new Set(allCards.map(c => c.Set))];

  ownerFilter.innerHTML = `<option value="All">All Owners</option>`;
  setFilter.innerHTML = `<option value="All">All Sets</option>`;

  owners.forEach(o => ownerFilter.innerHTML += `<option>${o}</option>`);
  sets.forEach(s => setFilter.innerHTML += `<option>${s}</option>`);
}

function render() {
  const results = document.getElementById("results");
  const status = document.getElementById("statusMessage");

  const searchRaw = document.getElementById("searchInput").value.trim().toLowerCase();
  const owner = document.getElementById("ownerFilter").value;
  const setName = document.getElementById("setFilter").value;
  const missingFilter = document.getElementById("missingFilter").value;
  const sortMode = document.getElementById("sortSelect").value;

  const isNumberSearch = /^\d+$/.test(searchRaw);

  const filtered = allCards.filter(c => {
    const pokemon = String(c.Pokemon || "").toLowerCase();
    const cardNumber = String(c.CardNumber || "").toLowerCase();

    return (
      c.Exists !== false &&
      (
        !searchRaw ||
        (isNumberSearch
          ? cardNumber.startsWith(searchRaw) // STRICT number match
          : pokemon.includes(searchRaw))
      ) &&
      (owner === "All" || c.Owner === owner) &&
      (setName === "All" || c.Set === setName)
    );
  });

  const grouped = {};

  filtered.forEach(c => {
    const key = `${c.Owner}|${c.Set}|${c.CardNumber}|${c.Pokemon}`;
    if (!grouped[key]) {
      grouped[key] = { ...c, variants: [] };
    }
    grouped[key].variants.push(c);
  });

  let groups = Object.values(grouped);

  if (missingFilter !== "All") {
    groups = groups.filter(g =>
      g.variants.some(v =>
        v.Exists !== false &&
        v.Variant === missingFilter &&
        !v.Owned
      )
    );
  }

  if (sortMode === "alpha") {
    groups.sort((a, b) => a.Pokemon.localeCompare(b.Pokemon));
  } else {
    groups.sort((a, b) => {
      const aNum = parseInt(a.CardNumber);
      const bNum = parseInt(b.CardNumber);
      return aNum - bNum;
    });
  }

  status.textContent = `${groups.length} cards`;

  if (!groups.length) {
    results.innerHTML = `<div class="empty-state">No results</div>`;
    return;
  }

  results.innerHTML = groups.map(g => {
    const variants = g.variants.map(v => {
      if (v.Exists === false) {
        return `<span class="variant-btn unavailable">${v.Variant}</span>`;
      }

      return `
        <button class="variant-btn ${v.Owned ? "owned" : "missing"}"
          onclick="toggleOwned('${v.Owner}','${v.Set}','${v.CardNumber}','${v.Variant}', ${v.Owned})">
          ${v.Variant}
        </button>
      `;
    }).join("");

    return `
      <div class="row-card">
        <div class="row-header">
          <div>
            <div class="pokemon-name">${g.Pokemon}</div>
            <div class="sub">#${g.CardNumber} • ${g.Set} • ${g.Owner}</div>
          </div>
        </div>
        <div class="variant-row">${variants}</div>
      </div>
    `;
  }).join("");
}

async function toggleOwned(owner, setName, cardNumber, variant, currentOwned) {
  if (isUpdating) return;
  isUpdating = true;

  try {
    const url = `${API_URL}?mode=update&owner=${owner}&setName=${setName}&cardNumber=${cardNumber}&variant=${encodeURIComponent(variant)}&owned=${!currentOwned}`;
    const res = await fetch(url);
    const result = await res.json();

    if (!result.success) throw new Error(result.message);

    fetchCards();
  } catch (err) {
    alert(err.message);
  } finally {
    isUpdating = false;
  }
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("ownerFilter").addEventListener("change", render);
document.getElementById("setFilter").addEventListener("change", render);
document.getElementById("missingFilter").addEventListener("change", render);
document.getElementById("sortSelect").addEventListener("change", render);

fetchCards();
