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
    const payload = await res.json();

    allCards = payload.data || [];

    populateFilters();
    render();

  } catch (error) {
    console.error(error);
    status.textContent = "Failed to load card data";
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

  const search = document.getElementById("searchInput").value.toLowerCase();
  const owner = document.getElementById("ownerFilter").value;
  const setName = document.getElementById("setFilter").value;
  const missingFilter = document.getElementById("missingFilter").value;
  const sortMode = document.getElementById("sortSelect").value;

  const filtered = allCards.filter(c => {
    return (
      c.Exists !== false &&
      (!search || c.Pokemon.toLowerCase().includes(search)) &&
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

  // Missing filter (REAL filter)
  if (missingFilter !== "All") {
    groups = groups.filter(g =>
      g.variants.some(v =>
        v.Exists !== false &&
        v.Variant === missingFilter &&
        v.Owned !== true
      )
    );
  }

  // SORT
  if (sortMode === "alpha") {
    groups.sort((a, b) => a.Pokemon.localeCompare(b.Pokemon));
  } else {
    groups.sort((a, b) => {
      const aNum = parseInt(a.CardNumber);
      const bNum = parseInt(b.CardNumber);
      return aNum - bNum;
    });
  }

  // COUNT LOGIC (this is what you were missing)
  const cardCount = groups.length;
  const variantCount = groups.reduce((sum, g) => sum + g.variants.length, 0);

  status.textContent = `${cardCount} cards (${variantCount} variants)`;

  if (!groups.length) {
    results.innerHTML = `<div class="empty-state">No matching cards found.</div>`;
    return;
  }

  results.innerHTML = groups.map(group => {
    const variants = group.variants.map(v => {
      if (v.Exists === false) {
        return `<span class="variant-btn unavailable">${v.Variant}</span>`;
      }

      const isTargetMissing =
        missingFilter !== "All" &&
        v.Variant === missingFilter &&
        !v.Owned;

      return `
        <button class="variant-btn ${v.Owned ? "owned" : "missing"} ${isTargetMissing ? "target-missing" : ""}"
          onclick="toggleOwned('${v.Owner}','${v.Set}','${v.CardNumber}','${v.Variant}', ${v.Owned}, true)">
          ${v.Variant}
        </button>
      `;
    }).join("");

    return `
      <div class="row-card">
        <div class="row-header">
          <div>
            <div class="pokemon-name">${group.Pokemon}</div>
            <div class="sub">#${group.CardNumber} • ${group.Set} • ${group.Owner}</div>
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
    const url = new URL(API_URL);
    url.searchParams.set("mode", "update");
    url.searchParams.set("owner", owner);
    url.searchParams.set("setName", setName);
    url.searchParams.set("cardNumber", cardNumber);
    url.searchParams.set("variant", variant);
    url.searchParams.set("owned", String(!currentOwned));

    const res = await fetch(url);
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message);
    }

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
