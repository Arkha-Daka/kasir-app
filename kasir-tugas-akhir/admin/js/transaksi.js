import { db } from "../../database/firebase-config.js";
import {
  escapeHTML,
  requireRole
} from "../../database/security.js";

import {
  collection,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireRole("admin", "../html/login-admin.html");

/* STATE */

let semuaTransaksi = [];
let unsubscribeTransaksi = null;

/* ELEMENT */

const table =
  document.getElementById("tableTransaksi");

const modal =
  document.getElementById("detailModal");

/* LOAD */

async function loadTransaksi() {

  const snap =
    await getDocs(
      collection(db, "transaksi")
    );

  semuaTransaksi = [];

  snap.forEach((doc) => {

    semuaTransaksi.push({
      id: doc.id,
      ...doc.data()
    });

  });

  semuaTransaksi.sort(
  (a, b) =>
    (b.timestamp?.toMillis?.() || 0)
    -
    (a.timestamp?.toMillis?.() || 0)
);

  renderFilterKasir();

  renderTable(semuaTransaksi);

  updateStats();

}

/* RENDER */

function renderTable(data) {

  if (!data.length) {

    table.innerHTML = `
      <tr>
        <td colspan="6">
          Tidak ada transaksi
        </td>
      </tr>
    `;

    return;

  }

  table.innerHTML = "";

  data.forEach((trx) => {

    let badgeClass = "badge-cash";

    if (trx.metode === "QRIS")
      badgeClass = "badge-qris";

    if (trx.metode === "Transfer")
      badgeClass = "badge-transfer";

    table.innerHTML += `
      <tr>

        <td>
          ${escapeHTML(trx.invoice || "-")}
        </td>

        <td>
          Rp ${Number(trx.total || 0)
            .toLocaleString("id-ID")}
        </td>

        <td>

          <span class="badge ${badgeClass}">
            ${escapeHTML(trx.metode || "Cash")}
          </span>

        </td>

        <td>
          ${escapeHTML(trx.kasir || "-")}
        </td>

        <td>
          ${escapeHTML(trx.tanggal || "-")}
        </td>

        <td>

          <button
            class="btn btn-detail"
            onclick='showDetail(${JSON.stringify(trx.id)})'>

            👁 Detail

          </button>

        </td>

      </tr>
    `;

  });

}

/* STATS */

function updateStats(data = semuaTransaksi) {

  document.getElementById("totalTransaksi")
  .textContent =
    data.length;

  let omzet = 0;

  let produk = 0;

  data.forEach((trx) => {

    omzet += Number(trx.total || 0);

    if (trx.items) {

      trx.items.forEach((item) => {

        produk += Number(item.qty || 0);

      });

    }

  });

  document.getElementById("totalOmzet")
  .textContent =
    "Rp " + omzet.toLocaleString("id-ID");

  document.getElementById("produkTerjual")
  .textContent =
    produk;

  const avg =
    data.length
      ? omzet / data.length
      : 0;

  document.getElementById("avgBelanja")
  .textContent =
    "Rp " +
    Math.round(avg)
    .toLocaleString("id-ID");

}

/* DETAIL */

window.showDetail =
function(id) {

  const trx =
    semuaTransaksi.find(
      t => t.id === id
    );

  if (!trx) return;

  let itemsHtml = "";

  if (trx.items) {

    trx.items.forEach((item) => {

      itemsHtml += `
        <div class="detail-item">

          <div>
            ${escapeHTML(item.nama)}
            (${escapeHTML(item.qty)}x)
          </div>

          <div>
            Rp ${Number(item.subtotal)
              .toLocaleString("id-ID")}
          </div>

        </div>
      `;

    });

  }

  document.getElementById("detailContent")
  .innerHTML = `

    <div class="detail-row">
      <span>Invoice</span>
      <strong>${escapeHTML(trx.invoice)}</strong>
    </div>

    <div class="detail-row">
      <span>Tanggal</span>
      <strong>${escapeHTML(trx.tanggal)}</strong>
    </div>

    <div class="detail-row">
      <span>Metode</span>
      <strong>${escapeHTML(trx.metode)}</strong>
    </div>

    <div class="detail-row">
      <span>Kasir</span>
      <strong>${escapeHTML(trx.kasir || "-")}</strong>
    </div>

    <div class="detail-row">
      <span>Total</span>
      <strong>
        Rp ${Number(trx.total)
          .toLocaleString("id-ID")}
      </strong>
    </div>

    <div class="detail-items">

      <h3>
        Item Barang
      </h3>

      ${itemsHtml}

    </div>

  `;

  modal.classList.add("show");

};

/* CLOSE MODAL */

document.getElementById("closeModal")
.onclick = () => {

  modal.classList.remove("show");

};

/* FILTER */

document.getElementById("searchInput")
.addEventListener("input", filterData);

document.getElementById("filterMetode")
.addEventListener("change", filterData);

document.getElementById("filterKasir")
.addEventListener("change", filterData);

document.getElementById("filterStart")
.addEventListener("change", filterData);

document.getElementById("filterEnd")
.addEventListener("change", filterData);

function renderFilterKasir() {

  const select =
    document.getElementById("filterKasir");

  const kasirList =
    [...new Set(
      semuaTransaksi
      .map((trx) => trx.kasir)
      .filter(Boolean)
    )];

  select.innerHTML =
    `<option value="">Semua Kasir</option>`
    +
    kasirList.map((kasir) =>
      `<option value="${escapeHTML(kasir)}">${escapeHTML(kasir)}</option>`
    ).join("");

}

function startRealtimeTransaksi() {
  if (unsubscribeTransaksi) {
    unsubscribeTransaksi();
  }

  unsubscribeTransaksi = onSnapshot(
    collection(db, "transaksi"),
    (snap) => {
      semuaTransaksi = [];

      snap.forEach((doc) => {
        semuaTransaksi.push({
          id: doc.id,
          ...doc.data()
        });
      });

      semuaTransaksi.sort(
        (a, b) =>
          (b.timestamp?.toMillis?.() || 0)
          -
          (a.timestamp?.toMillis?.() || 0)
      );

      renderFilterKasir();
      filterData();
    },
    (error) => {
      console.warn("Realtime transaksi gagal:", error);
      loadTransaksi();
    }
  );
}

function getWaktuTransaksi(trx) {

  return trx.timestamp?.toMillis?.()
    ||
    Date.parse(trx.tanggal)
    ||
    0;

}

function filterData() {

  const q =
    document.getElementById("searchInput")
    .value.toLowerCase();

  const metode =
    document.getElementById("filterMetode")
    .value;

  const kasir =
    document.getElementById("filterKasir")
    .value;

  const startValue =
    document.getElementById("filterStart")
    .value;

  const endValue =
    document.getElementById("filterEnd")
    .value;

  const start =
    startValue
      ? new Date(`${startValue}T00:00:00`).getTime()
      : 0;

  const end =
    endValue
      ? new Date(`${endValue}T23:59:59`).getTime()
      : Infinity;

  const filtered =
    semuaTransaksi.filter((trx) => {

      const cocokSearch =
        (trx.invoice || "")
        .toLowerCase()
        .includes(q);

      const cocokMetode =
        !metode
        ||
        trx.metode === metode;

      const cocokKasir =
        !kasir
        ||
        trx.kasir === kasir;

      const waktu =
        getWaktuTransaksi(trx);

      const cocokTanggal =
        waktu >= start
        &&
        waktu <= end;

      return cocokSearch
        && cocokMetode
        && cocokKasir
        && cocokTanggal;

    });

  renderTable(filtered);
  updateStats(filtered);

}

/* INIT */

startRealtimeTransaksi();
