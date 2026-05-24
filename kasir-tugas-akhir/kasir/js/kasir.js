// kasir.js

import { db } from "../../database/firebase-config.js";
import { catatAktivitas } from "../../database/activity-log.js";
import {
  clearLoginUser,
  requireRole
} from "../../database/security.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   CEK LOGIN
========================= */

const loginUser =
  requireRole("kasir", "../html/login-kasir.html");

/* ───────────────────────────────────────
   STATE
─────────────────────────────────────── */

let keranjang      = [];
let barangDipilih  = null;
let editKeranjang  = null;
let html5QrCode    = null;
let kameraAktif    = false;
let totalAkhir     = 0;
let semuaBarang    = [];
let lastReceipt    = null;
let kategoriAktif  = "";
let paymentInfo    = {};
const loadedScripts = {};

const kasirBadge =
  document.getElementById("kasirBadge");

if (kasirBadge) {

  const namaKasir =
    loginUser.nama
    ||
    loginUser.username
    ||
    "Kasir";

  kasirBadge.textContent =
    `Kasir : ${namaKasir}`;

}

const PPN_RATE    = 0.11;
const DISKON_MIN  = 100000;
const DISKON_RATE = 0.10;

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

function loadScriptOnce(src) {

  if (loadedScripts[src]) {
    return loadedScripts[src];
  }

  loadedScripts[src] =
    new Promise((resolve, reject) => {

      const existing =
        document.querySelector(
          `script[src="${src}"]`
        );

      if (existing) {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", reject);
        return;
      }

      const script =
        document.createElement("script");

      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);

    });

  return loadedScripts[src];

}

async function loadBarangCache() {

  const snap =
    await getDocs(
      collection(db, "barang")
    );

  semuaBarang = [];

  snap.forEach((docu) => {

    semuaBarang.push({
      id: docu.id,
      ...docu.data()
    });

  });

  renderKategoriCepat();
  renderProdukPopuler();

}

function renderKategoriCepat() {

  const el =
    document.getElementById("kategoriCepat");

  if (!el) return;

  const kategoriList =
    [...new Set(
      semuaBarang.map(
        item => item.kategori || "lainnya"
      )
    )];

  el.innerHTML = `
    <select
      class="compact-select"
      onchange="filterKategoriCepat(this.value)"
    >
      <option value="">Semua kategori</option>
    ${kategoriList.map((kategori) => `
      <option
        value="${escapeHtml(kategori)}"
        ${kategoriAktif === kategori ? "selected" : ""}
      >
        ${escapeHtml(kategori.toLowerCase())}
      </option>
    `).join("")}
    </select>
  `;

}

window.filterKategoriCepat = function (kategori) {

  kategoriAktif = kategori;
  renderKategoriCepat();
  renderProdukPopuler();

};

function renderProdukPopuler() {

  const el =
    document.getElementById("produkPopuler");

  if (!el) return;

  const data =
    semuaBarang
    .filter((item) =>
      !kategoriAktif
      ||
      item.kategori === kategoriAktif
    )
    .sort((a, b) =>
      Number(b.stok || 0)
      -
      Number(a.stok || 0)
    )
    .slice(0, 5);

  el.innerHTML =
    data.length
      ? `
        <select
          class="compact-select"
          onchange="if (this.value) pilihProduk(this.value); this.value = '';"
        >
          <option value="">Pilih produk terlaris</option>
          ${data.map((item) => `
            <option value="${escapeHtml(item.id)}">
              ${escapeHtml(item.nama)} - ${rp(item.harga)} | stok ${escapeHtml(item.stok)}
            </option>
          `).join("")}
        </select>
      `
      : `<div class="mini-empty">Tidak ada produk</div>`;

}

function pilihBarang(barang) {

  barangDipilih = barang;

  document.getElementById(
    "barcodeInput"
  ).value = barang.kode;

  document.getElementById(
    "namaBarang"
  ).value = barang.nama;

  document.getElementById(
    "hargaBarang"
  ).value = rp(barang.harga);

  document.getElementById(
    "hargaBarang"
  ).dataset.raw = barang.harga;

  document.getElementById(
    "produkSuggestions"
  ).classList.remove("show");

  document.getElementById(
    "jumlahBarang"
  ).focus();

  if (Number(barang.stok || 0) <= 5) {
    showToast(
      `Stok ${barang.nama} tinggal ${barang.stok}`,
      "err"
    );
  }

}

window.pilihProduk = function (id) {

  const barang =
    semuaBarang.find(
      item => item.id === id
    );

  if (!barang) return;

  pilihBarang(barang);

};

window.logoutKasir = function () {

  clearLoginUser("kasir");

  window.location.href =
    "../html/login-kasir.html";

};

/* ───────────────────────────────────────
   THEME
─────────────────────────────────────── */

window.toggleTheme = function () {

  const dark =
    document.body.classList.toggle("dark");

  document.getElementById(
    "toggleTheme"
  ).textContent =
    dark ? "☀️" : "🌙";

  localStorage.setItem(
    "theme",
    dark ? "dark" : "light"
  );

};

(function () {

  if (
    localStorage.getItem("theme")
    === "dark"
  ) {

    document.body.classList.add("dark");

    document.getElementById(
      "toggleTheme"
    ).textContent = "☀️";

  }

})();

/* ───────────────────────────────────────
   KAMERA
─────────────────────────────────────── */

window.nyalakanKamera = async function () {

  if (kameraAktif) return;

  try {

    await loadScriptOnce(
      "https://unpkg.com/html5-qrcode"
    );

    html5QrCode =
      new Html5Qrcode("reader");

    const devices =
      await Html5Qrcode.getCameras();

    if (!devices.length) {

      showToast(
        "Kamera tidak ditemukan",
        "err"
      );

      return;

    }

    await html5QrCode.start(

      devices[0].id,

      {
        fps: 10,
        qrbox: {
          width: 220,
          height: 180
        }
      },

      (decoded) => {

        document.getElementById(
          "barcodeInput"
        ).value = decoded;

        cekBarang();

      }

    );

    kameraAktif = true;

  } catch (e) {

    showToast(
      "Gagal akses kamera",
      "err"
    );

  }

};

window.matikanKamera = async function () {

  if (
    html5QrCode &&
    kameraAktif
  ) {

    await html5QrCode.stop();

    kameraAktif = false;

    document.getElementById(
      "reader"
    ).innerHTML = "";

  }

};

/* ───────────────────────────────────────
   CEK BARANG
─────────────────────────────────────── */

window.cekBarang = async function () {

  const kode =
    document.getElementById(
      "barcodeInput"
    ).value.trim()
    .toLowerCase();

  if (!kode) {

    showToast(
      "Masukkan kode barang!",
      "err"
    );

    return;

  }

  const btn =
    document.getElementById("btnCek");

  btn.innerHTML =
    '<span class="spin"></span>';

  btn.disabled = true;

  try {

    if (!semuaBarang.length) {
      await loadBarangCache();
    }

    const barang =
      semuaBarang.find(
        b =>
          (b.kode || "")
          .toLowerCase() === kode
      );

    if (barang) {

      pilihBarang(barang);

    } else {

      barangDipilih = null;

      showToast(
        "Barang tidak ditemukan!",
        "err"
      );

      document.getElementById(
        "namaBarang"
      ).value = "";

      document.getElementById(
        "hargaBarang"
      ).value = "";

    }

  } catch (e) {

    showToast(
      "Koneksi gagal",
      "err"
    );

    } finally {

    btn.innerHTML = "🔍";

    btn.disabled = false;

  }

};

/* ───────────────────────────────────────
   TAMBAH KERANJANG
─────────────────────────────────────── */

window.tambahKeKasir = function () {

  if (!barangDipilih) {

    showToast(
      "Pilih barang dahulu!",
      "err"
    );

    return;

  }

  const jumlah =
    Number(
      document.getElementById(
        "jumlahBarang"
      ).value
    );

  if (
    jumlah <= 0 ||
    isNaN(jumlah)
  ) {

    showToast(
      "Masukkan jumlah valid!",
      "err"
    );

    return;

  }

  /* VALIDASI STOK */

  if (
    jumlah > barangDipilih.stok
  ) {

    showToast(
      "Stok tidak cukup!",
      "err"
    );

    return;

  }

  const qtyDiKeranjang =
    keranjang
    .filter((item) =>
      item.kode === barangDipilih.kode
    )
    .reduce(
      (sum, item) => sum + Number(item.jumlah || 0),
      0
    );

  if (
    editKeranjang === null
    &&
    qtyDiKeranjang + jumlah > barangDipilih.stok
  ) {

    showToast(
      "Total qty melebihi stok!",
      "err"
    );

    return;

  }

  if (editKeranjang !== null) {

    keranjang[editKeranjang].jumlah =
      jumlah;

    keranjang[editKeranjang].subtotal =
      keranjang[editKeranjang].harga
      * jumlah;

    editKeranjang = null;

    document.getElementById(
      "btnKeranjang"
    ).textContent =
      "＋ Tambah ke Keranjang";

    showToast(
      "Keranjang diperbarui ✓",
      "ok"
    );

  } else {

    const idx =
      keranjang.findIndex(
        i => i.kode === barangDipilih.kode
      );

    if (idx >= 0) {

      keranjang[idx].jumlah += jumlah;

      keranjang[idx].subtotal =
        keranjang[idx].harga *
        keranjang[idx].jumlah;

    } else {

      keranjang.push({

        ...barangDipilih,

        jumlah,

        subtotal:
          barangDipilih.harga * jumlah

      });

    }

    showToast(
      "Barang ditambahkan ✓",
      "ok"
    );

  }

  renderKasir();

  resetForm();

};

/* ───────────────────────────────────────
   EDIT ITEM
─────────────────────────────────────── */

window.editItem = function (idx) {

  editKeranjang = idx;

  const item =
    keranjang[idx];

  barangDipilih = item;

  document.getElementById(
    "barcodeInput"
  ).value = item.kode;

  document.getElementById(
    "namaBarang"
  ).value = item.nama;

  document.getElementById(
    "hargaBarang"
  ).value = rp(item.harga);

  document.getElementById(
    "jumlahBarang"
  ).value = item.jumlah;

  document.getElementById(
    "btnKeranjang"
  ).textContent =
    "✔ Simpan Perubahan";

};

/* ───────────────────────────────────────
   HAPUS ITEM
─────────────────────────────────────── */

window.hapusItem = function (idx) {

  keranjang.splice(idx, 1);

  renderKasir();

  showToast(
    "Barang dihapus",
    "err"
  );

};

/* ───────────────────────────────────────
   SIMPAN QTY
─────────────────────────────────────── */

window.simpanQty = function (idx) {

  const val = Number(
    document.getElementById(
      `qtyEdit-${idx}`
    ).value
  );

  if (
    val <= 0 ||
    isNaN(val)
  ) {

    showToast(
      "Jumlah tidak valid!",
      "err"
    );

    return;

  }

  keranjang[idx].jumlah =
    val;

  keranjang[idx].subtotal =
    keranjang[idx].harga * val;

  renderKasir();

  showToast(
    "Jumlah diperbarui ✓",
    "ok"
  );

};

/* ───────────────────────────────────────
   RENDER KASIR
─────────────────────────────────────── */

function renderKasir() {

  const tbody =
    document.getElementById("dataKasir");

  tbody.innerHTML = "";

  if (!keranjang.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty">
            <div class="empty-icon">🛒</div>
            <p>Keranjang masih kosong</p>
          </div>
        </td>
      </tr>
    `;

    document.getElementById(
      "summaryBox"
    ).style.display = "none";

    document.getElementById(
      "payMethodWrap"
    ).style.display = "none";

    document.getElementById(
      "paymentArea"
    ).innerHTML = "";

    return;

  }

  keranjang.forEach((item, i) => {

    tbody.innerHTML += `
      <tr>

        <td>${i + 1}</td>

        <td>${escapeHtml(item.nama)}</td>

        <td class="mono">
          ${rp(item.harga)}
        </td>

        <td class="center">

          <div class="qty-control">

            <button
              class="btn btn-ghost btn-sm"
              onclick="ubahQty(${i}, -1)"
            >
              -
            </button>

            <input
              class="qty-input"
              id="qtyEdit-${i}"
              type="number"
              value="${escapeHtml(item.jumlah)}"
              min="1"
            >

            <button
              class="btn btn-blue btn-sm"
              onclick="simpanQty(${i})"
            >
              ✔
            </button>

            <button
              class="btn btn-ghost btn-sm"
              onclick="ubahQty(${i}, 1)"
            >
              +
            </button>

          </div>

        </td>

        <td class="mono">
          ${rp(item.subtotal)}
        </td>

        <td class="center">

          <div class="td-actions">

            <button
              class="btn btn-ghost btn-sm"
              onclick="editItem(${i})"
            >
              ✏
            </button>

            <button
              class="btn btn-red btn-sm"
              onclick="hapusItem(${i})"
            >
              🗑
            </button>

          </div>

        </td>

      </tr>
    `;

  });

  hitungSummary();

  document.getElementById(
    "payMethodWrap"
  ).style.display = "flex";

  document.getElementById(
    "payMethodWrap"
  ).style.flexDirection = "column";

  document.getElementById(
    "payMethodWrap"
  ).style.gap = "12px";

  renderPayment();

}

/* ───────────────────────────────────────
   HITUNG SUMMARY
─────────────────────────────────────── */

function hitungSummary() {

  const subtotal =
    keranjang.reduce(
      (s, i) => s + i.subtotal,
      0
    );

  const diskon =
    subtotal > DISKON_MIN
      ? subtotal * DISKON_RATE
      : 0;

  const setelahDiskon =
    subtotal - diskon;

  const ppn =
    setelahDiskon * PPN_RATE;

  totalAkhir =
    setelahDiskon + ppn;

  document.getElementById(
    "sumSubtotal"
  ).textContent =
    rp(subtotal);

  document.getElementById(
    "sumDiskon"
  ).textContent =
    "- " + rp(diskon);

  document.getElementById(
    "sumPPN"
  ).textContent =
    rp(ppn);

  document.getElementById(
    "sumTotal"
  ).textContent =
    rp(totalAkhir);

  document.getElementById(
    "summaryBox"
  ).style.display = "flex";

}

/* ───────────────────────────────────────
   PAYMENT
─────────────────────────────────────── */

window.renderPayment = async function () {

  const metode =
    document.getElementById(
      "metodeBayar"
    ).value;

  const area =
    document.getElementById(
      "paymentArea"
    );

  area.innerHTML = "";

  if (!keranjang.length) return;

  /* QRIS */

  if (metode === "qris") {

    area.innerHTML = `
      <div class="pay-box qris-box">

        <div class="qris-label">
          QRIS Kantin Sekolah
        </div>

        <div class="qris-amount">
          ${rp(totalAkhir)}
        </div>

        <div class="qris-placeholder">
          Tempel foto QRIS di area ini
        </div>

        <div class="cash-sub">
          Setelah siswa membayar, tekan tombol konfirmasi.
        </div>

      </div>

      <button
        class="btn btn-accent"
        style="width:100%;margin-top:12px"
        onclick="selesai('QRIS')"
      >
        Konfirmasi QRIS Selesai
      </button>
    `;

  }

  /* TRANSFER */

  else if (
    metode === "transfer"
  ) {

    area.innerHTML = `
      <div class="pay-box transfer-box">

        <div class="transfer-row">
          <span class="k">Bank</span>
          <span class="v">BCA</span>
        </div>

        <div class="transfer-row">
          <span class="k">No Rek</span>
          <span class="v">1234567890</span>
        </div>

        <div class="transfer-row">
          <span class="k">Total</span>
          <span class="v accent">
            ${rp(totalAkhir)}
          </span>
        </div>

      </div>

      <button
        class="btn btn-accent"
        style="
          width:100%;
          margin-top:12px
        "
        onclick="selesai('Transfer')"
      >
        Konfirmasi Transfer Selesai
      </button>
    `;

  }

  /* CASH */

  else {

    area.innerHTML = `
      <div class="pay-box">

        <div class="cash-box">

          <div class="cash-amount">
            ${rp(totalAkhir)}
          </div>

          <div class="cash-sub">
            Tagihan pelanggan
          </div>

          <div class="field" style="text-align:left;margin-bottom:12px">
            <label class="field-label">Uang Diterima</label>
            <input
              type="number"
              id="uangDiterima"
              placeholder="0"
              oninput="hitungKembalian()"
            >
          </div>

          <div class="cash-change">
            Kembalian:
            <span id="kembalianCash">Rp 0</span>
          </div>

          <button
            class="btn btn-checkout"
            onclick="selesaiCash()"
          >
            Bayar Cash Selesai
          </button>

        </div>

      </div>
    `;

  }

};

window.hitungKembalian = function () {

  const bayar =
    Number(
      document.getElementById("uangDiterima")?.value || 0
    );

  const kembalian =
    bayar - totalAkhir;

  document.getElementById(
    "kembalianCash"
  ).textContent =
    rp(Math.max(kembalian, 0));

};

/* ───────────────────────────────────────
   SIMPAN TRANSAKSI
─────────────────────────────────────── */

async function simpanTransaksi(metode) {

  try {

    const invoice =
      "INV-" + Date.now();

    const tanggal =
      new Date().toLocaleString(
        "id-ID"
      );

    const subtotal =
      keranjang.reduce(
        (s, i) => s + i.subtotal,
        0
      );

    const diskon =
      subtotal > DISKON_MIN
        ? subtotal * DISKON_RATE
        : 0;

    const ppn =
      (subtotal - diskon)
      * PPN_RATE;

    const items =
      keranjang.map(
        (item) => ({

          id: item.id,
          kode: item.kode,
          nama: item.nama,
          qty: item.jumlah,
          harga: item.harga,
          subtotal: item.subtotal,
          stokSebelum: item.stok,
          stokSesudah: item.stok - item.jumlah

        })
      );

    const kasir =
      loginUser.nama
      ||
      loginUser.username
      || "Kasir";

    const receiptData = {
      invoice,
      tanggal,
      metode,
      kasir,
      subtotal,
      diskon,
      ppn,
      total: totalAkhir,
      bayar: paymentInfo.bayar || 0,
      kembalian: paymentInfo.kembalian || 0,
      items
    };

    const transaksiRef = await addDoc(

      collection(db, "transaksi"),

      {

        invoice,
        tanggal,
        metode,

        subtotal,
        diskon,
        ppn,

        total: totalAkhir,
        bayar: paymentInfo.bayar || 0,
        kembalian: paymentInfo.kembalian || 0,
        kasir,
        statusPembayaran: "Selesai",

        timestamp: serverTimestamp(),

        items: items.map((item) => ({
          kode: item.kode,
          nama: item.nama,
          qty: item.qty,
          harga: item.harga,
          subtotal: item.subtotal
        }))

      }

    );

    await catatAktivitas({
      tipe: "transaksi",
      judul: `Transaksi ${invoice}`,
      deskripsi:
        `${metode} sebesar ${rp(totalAkhir)}`,
      refId: transaksiRef.id,
      meta: {
        invoice,
        metode,
        total: totalAkhir,
        jumlahItem: items.length
      }
    });

    for (const item of items) {

      const stokBaru =
        item.stokSesudah;

      await updateDoc(

        doc(
          db,
          "barang",
          item.id
        ),

        {
          stok: stokBaru,
          updatedAt: serverTimestamp()
        }

      );

      try {
        await addDoc(
          collection(db, "stokLog"),
          {
            barangId: item.id,
            kode: item.kode,
            nama: item.nama,
            tipe: "keluar",
            qty: item.qty,
            stokSebelum: item.stokSebelum,
            stokSesudah: item.stokSesudah,
            sumber: "transaksi",
            refId: transaksiRef.id,
            invoice,
            createdAt: serverTimestamp()
          }
        );
      } catch (err) {
        console.warn("Gagal mencatat riwayat stok:", err);
      }

    }

    return receiptData;

  } catch (err) {

    console.error(err);

    showToast(
      "Gagal simpan transaksi",
      "err"
    );

    return null;

  }

}

/* ───────────────────────────────────────
   SELESAI
─────────────────────────────────────── */

window.selesaiCash = function () {

  const uangDiterima =
    Number(
      document.getElementById("uangDiterima")?.value || 0
    );

  if (uangDiterima < totalAkhir) {
    showToast("Uang cash belum cukup", "err");
    return;
  }

  paymentInfo = {
    bayar: uangDiterima,
    kembalian: uangDiterima - totalAkhir
  };

  selesai("Cash");

};

async function selesai(metode) {

  if (metode !== "Cash") {
    paymentInfo = {};
  }

  const receiptData =
    await simpanTransaksi(metode);

  if (!receiptData) return;

  showToast(
    "Pembayaran berhasil ✓",
    "ok"
  );

  keranjang = [];

  barangDipilih = null;

  editKeranjang = null;

  totalAkhir = 0;

  renderKasir();

  resetForm();

  showReceipt(receiptData);
  paymentInfo = {};
  await loadBarangCache();

}

window.selesai = selesai;

function showReceipt(data) {

  lastReceipt = data;

  document.getElementById(
    "receiptSubtitle"
  ).textContent =
    `${data.invoice} - ${data.metode}`;

  const itemsHtml =
    data.items.map((item) => `
      <div>
        <div>${escapeHtml(item.nama)}</div>
        <div class="receipt-row">
          <span>${escapeHtml(item.qty)} x ${rp(item.harga)}</span>
          <span>${rp(item.subtotal)}</span>
        </div>
      </div>
    `).join("");

  document.getElementById(
    "receiptContent"
  ).innerHTML = `
    <div class="receipt-head">
      <strong>Boedoet Store</strong><br>
      Struk Pembayaran
    </div>

    <div>Invoice: ${escapeHtml(data.invoice)}</div>
    <div>Tanggal: ${escapeHtml(data.tanggal)}</div>
    <div>Kasir: ${escapeHtml(data.kasir)}</div>
    <div>Metode: ${escapeHtml(data.metode)}</div>

    <div class="receipt-line"></div>

    ${itemsHtml}

    <div class="receipt-line"></div>

    <div class="receipt-row">
      <span>Subtotal</span>
      <span>${rp(data.subtotal)}</span>
    </div>
    <div class="receipt-row">
      <span>Diskon</span>
      <span>${rp(data.diskon)}</span>
    </div>
    <div class="receipt-row">
      <span>PPN</span>
      <span>${rp(data.ppn)}</span>
    </div>
    <div class="receipt-row receipt-total">
      <span>Total</span>
      <span>${rp(data.total)}</span>
    </div>
    ${data.metode === "Cash" ? `
      <div class="receipt-row">
        <span>Bayar</span>
        <span>${rp(data.bayar)}</span>
      </div>
      <div class="receipt-row">
        <span>Kembalian</span>
        <span>${rp(data.kembalian)}</span>
      </div>
    ` : ""}

    <div class="receipt-line"></div>
    <div class="receipt-head">Terima kasih</div>
  `;

  document.getElementById(
    "receiptOverlay"
  ).classList.add("show");

}

window.closeReceipt = function () {

  document.getElementById(
    "receiptOverlay"
  ).classList.remove("show");

};

window.ubahQty = function (idx, delta) {

  const item =
    keranjang[idx];

  if (!item) return;

  const nextQty =
    Number(item.jumlah || 0) + delta;

  if (nextQty <= 0) {
    hapusItem(idx);
    return;
  }

  if (nextQty > item.stok) {
    showToast("Stok tidak cukup!", "err");
    return;
  }

  item.jumlah = nextQty;
  item.subtotal = item.harga * nextQty;

  renderKasir();

};

window.resetKeranjang = function () {

  if (!keranjang.length) return;

  if (!confirm("Kosongkan keranjang?")) return;

  keranjang = [];
  barangDipilih = null;
  editKeranjang = null;
  totalAkhir = 0;

  renderKasir();
  resetForm();

};

window.printReceipt = function () {

  if (!lastReceipt) return;

  window.print();

};

/* ───────────────────────────────────────
   RESET FORM
─────────────────────────────────────── */

function resetForm() {

  document.getElementById(
    "barcodeInput"
  ).value = "";

  document.getElementById(
    "namaBarang"
  ).value = "";

  document.getElementById(
    "hargaBarang"
  ).value = "";

  document.getElementById(
    "jumlahBarang"
  ).value = "";

}

/* ───────────────────────────────────────
   RUPIAH
─────────────────────────────────────── */

function rp(n) {

  return "Rp " +
    Number(n)
      .toLocaleString("id-ID");

}

/* ───────────────────────────────────────
   TOAST
─────────────────────────────────────── */

function showToast(
  msg,
  type = ""
) {

  const t =
    document.getElementById("toast");

  t.textContent = msg;

  t.className =
    "toast " + type;

  t.classList.add("show");

  clearTimeout(window._toast);

  window._toast =
    setTimeout(() => {

      t.classList.remove("show");

    }, 2500);

}

/* ───────────────────────────────────────
   SHORTCUT
─────────────────────────────────────── */

document.getElementById(
  "barcodeInput"
).addEventListener(
  "keydown",
  e => {

    if (e.key === "Enter")
      cekBarang();

  }
);

document.getElementById(
  "searchProduk"
).addEventListener(
  "input",
  async (e) => {

    e.target.value =
      e.target.value.toLowerCase();

    const q =
      e.target.value
      .trim()
      .toLowerCase();

    const list =
      document.getElementById(
        "produkSuggestions"
      );

    if (!q) {
      list.classList.remove("show");
      list.innerHTML = "";
      return;
    }

    if (!semuaBarang.length) {
      await loadBarangCache();
    }

    const hasil =
      semuaBarang
      .filter((item) =>
        (item.nama || "")
        .toLowerCase()
        .includes(q)
        ||
        (item.kode || "")
        .toLowerCase()
        .includes(q)
      )
      .slice(0, 6);

    list.innerHTML =
      hasil.length
        ? hasil.map((item) => `
          <button
            type="button"
            class="suggest-item"
            onclick='pilihProduk(${JSON.stringify(item.id)})'
          >
            <span>${escapeHtml(item.nama)}</span>
            <span>${rp(item.harga)} | Stok ${escapeHtml(item.stok)}</span>
          </button>
        `).join("")
        : `<div class="suggest-item">Produk tidak ditemukan</div>`;

    list.classList.add("show");

  }
);

document.getElementById(
  "jumlahBarang"
).addEventListener(
  "keydown",
  e => {

    if (e.key === "Enter")
      tambahKeKasir();

  }
);

loadBarangCache().catch((err) => {
  console.warn("Gagal memuat produk:", err);
});
