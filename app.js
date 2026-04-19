const API_URL = "https://script.google.com/macros/s/AKfycbx4DKPQ9ykHaTb6AWI92A8IeV1HBp6RtxzNkjnsl3hFhonWBhAa20coEKIWRI_5vi_F/exec";

let allCards = [];

async function fetchCards() {
  const res = await fetch(API_URL);
  const data = await res.json();

  allCards = data;
  populateFilters();
  render();
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

  const search = document.getElementById("searchInput").value.toLowerCase();
  const owner = document.getElementById("ownerFilter").value;
  const set = document.getElementById("setFilter").value;

  const filtered = allCards.filter(c => {
    return (
      (!search || c.Pokemon.toLowerCase().includes(search)) &&
      (owner === "All" || c.Owner === owner) &&
      (set === "All" || c.Set === set)
    );
  });

  results.innerHTML = filtered.map(c => `
    <div class="card ${c.Owned ? "owned-true" : "owned-false"}">
      <h3>${c.Pokemon}</h3>
      <div>#${c.CardNumber}</div>
      <div>${c.Variant}</div>
      <div>${c.Owner}</div>
    </div>
  `).join("");
}

document.getElementById("searchInput").addEventListener("input", render);
document.getElementById("ownerFilter").addEventListener("change", render);
document.getElementById("setFilter").addEventListener("change", render);

fetchCards();
setInterval(fetchCards, 30000);
