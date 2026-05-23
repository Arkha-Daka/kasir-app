import { db } from "../../database/firebase-config.js";
import { catatAktivitas } from "../../database/activity-log.js";
import {
  escapeHTML,
  requireRole
} from "../../database/security.js";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireRole("admin", "../html/login-admin.html");

/* STATE */

let editId = null;

let semuaBarang = [];

/* ELEMENT */

const tableBarang =
  document.getElementById("tableBarang");

const modal =
  document.getElementById("modalBarang");

/* MODAL */

document.getElementById("openModal")
.onclick = () => {

  modal.classList.add("show");

};

document.getElementById("closeModal")
.onclick = closeModal;

function closeModal() {

  modal.classList.remove("show");

  resetForm();

}

/* SAVE */

document.getElementById("saveBarang")
.onclick = simpanBarang;

document.getElementById("namaBarang")
.addEventListener("input", (e) => {

  e.target.value =
    e.target.value.toLowerCase();

});

document.getElementById("kategoriCustom")
.addEventListener("input", (e) => {

  e.target.value =
    e.target.value.toLowerCase();

});

async function simpanBarang() {

  const nama =
    document.getElementById("namaBarang")
    .value.trim()
    .toLowerCase();

  const kategoriCustom =
    document.getElementById("kategoriCustom")
    .value.trim()
    .toLowerCase();

  const kategori =
    kategoriCustom
      ||
      document.getElementById("kategoriBarang")
      .value.toLowerCase();

  const harga =
    Number(
      document.getElementById("hargaBarang")
      .value
    );

  const stok =
    Number(
      document.getElementById("stokBarang")
      .value
    );

  if (!nama || harga <= 0) {
    alert("Isi data dengan benar");
    return;
  }

  try {

    if (editId) {

      const barangLama =
        semuaBarang.find(
          b => b.id === editId
        );

      const stokLama =
        Number(barangLama?.stok || 0);

      await updateDoc(
        doc(db, "barang", editId),
        {
          nama,
          kategori,
          harga,
          stok,

          updatedAt: serverTimestamp()
        }
      );

      await catatAktivitas({
        tipe: "barang",
        judul: `Barang ${nama} diperbarui`,
        deskripsi: `Stok sekarang ${stok}`,
        refId: editId,
        meta: {
          nama,
          kategori,
          harga,
          stok
        }
      });

      if (stok !== stokLama) {

        try {
          await addDoc(
            collection(db, "stokLog"),
            {
              barangId: editId,
              kode: barangLama?.kode || "",
              nama,
              tipe: stok > stokLama ? "masuk" : "keluar",
              qty: Math.abs(stok - stokLama),
              stokSebelum: stokLama,
              stokSesudah: stok,
              sumber: "edit barang",
              createdAt: serverTimestamp()
            }
          );
        } catch (err) {
          console.warn("Gagal mencatat riwayat stok:", err);
        }

      }

    } else {

      const kodeBarang =
        "BRG" + Date.now();

      const barangRef = await addDoc(
        collection(db, "barang"),
        {
          kode:
            kodeBarang,

          nama,
          kategori,
          harga,
          stok,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

      await catatAktivitas({
        tipe: "barang",
        judul: `Barang baru ${nama} ditambahkan`,
        deskripsi: `Stok awal ${stok}`,
        refId: barangRef.id,
        meta: {
          nama,
          kategori,
          harga,
          stok
        }
      });

      try {
        await addDoc(
          collection(db, "stokLog"),
          {
            barangId: barangRef.id,
            kode: kodeBarang,
            nama,
            tipe: "masuk",
            qty: stok,
            stokSebelum: 0,
            stokSesudah: stok,
            sumber: "barang baru",
            createdAt: serverTimestamp()
          }
        );
      } catch (err) {
        console.warn("Gagal mencatat riwayat stok:", err);
      }

    }

    closeModal();

    loadBarang();

  } catch (err) {

    console.error(err);

  }

}

/* LOAD */

async function loadBarang() {

  const snap =
    await getDocs(
      collection(db, "barang")
    );

  semuaBarang = [];

  snap.forEach((item) => {

    semuaBarang.push({
      id: item.id,
      ...item.data()
    });

  });

  renderBarang(semuaBarang);

  updateStats();

}

/* RENDER */

function renderBarang(data) {

  if (!data.length) {

    tableBarang.innerHTML = `
      <tr>
        <td colspan="7">
          Tidak ada data
        </td>
      </tr>
    `;

    return;

  }

  tableBarang.innerHTML = "";

  data.forEach((b, i) => {

    const barcodeId =
      "barcode-" + i;

    let stockClass = "stock-safe";

    if (b.stok <= 5)
      stockClass = "stock-low";

    if (b.stok <= 0)
      stockClass = "stock-empty";

    tableBarang.innerHTML += `
      <tr>

        <td>${escapeHTML(b.kode)}</td>

        <td>${escapeHTML(b.nama)}</td>

        <td>${escapeHTML(b.kategori)}</td>

        <td>
          Rp ${Number(b.harga)
            .toLocaleString("id-ID")}
        </td>

        <td>

          <span class="badge-stock ${stockClass}">
            ${escapeHTML(b.stok)}
          </span>

        </td>

        <td class="barcode-box">

          <svg id="${barcodeId}"></svg>

        </td>

        <td>

          <div class="action-group">

            <button
              class="btn btn-edit"
              onclick='editBarang(${JSON.stringify(b.id)})'>

              ✏

            </button>

            <button
              class="btn btn-delete"
              onclick='hapusBarang(${JSON.stringify(b.id)})'>

              🗑

            </button>

          </div>

        </td>

      </tr>
    `;

    setTimeout(() => {

      JsBarcode(
        `#${barcodeId}`,
        b.kode,
        {
          format: "CODE128",
          width: 1.4,
          height: 35,
          displayValue: false,
          background: "transparent",
          lineColor:
            document.body.classList
            .contains("dark")
              ? "#ffffff"
              : "#000000"
        }
      );

    }, 10);

  });

}

/* EDIT */

window.editBarang =
function(id) {

  const barang =
    semuaBarang.find(
      b => b.id === id
    );

  if (!barang) return;

  editId = id;

  document.getElementById("namaBarang")
  .value = barang.nama;

  document.getElementById("kategoriBarang")
  .value = barang.kategori;

  document.getElementById("kategoriCustom")
  .value = "";

  document.getElementById("hargaBarang")
  .value = barang.harga;

  document.getElementById("stokBarang")
  .value = barang.stok;

  document.getElementById("modalTitle")
  .textContent = "Edit Barang";

  modal.classList.add("show");

};

/* DELETE */

window.hapusBarang =
async function(id) {

  if (!confirm("Hapus barang?"))
    return;

  await deleteDoc(
    doc(db, "barang", id)
  );

  loadBarang();

};

/* RESET */

function resetForm() {

  editId = null;

  document.getElementById("modalTitle")
  .textContent = "Tambah Barang";

  document.getElementById("namaBarang")
  .value = "";

  document.getElementById("hargaBarang")
  .value = "";

  document.getElementById("stokBarang")
  .value = "";

  document.getElementById("kategoriCustom")
  .value = "";

}

/* SEARCH */

document.getElementById("searchInput")
.addEventListener("input", filterBarang);

document.getElementById("filterKategori")
.addEventListener("change", filterBarang);

function filterBarang() {

  const q =
    document.getElementById("searchInput")
    .value.toLowerCase();

  const kategori =
    document.getElementById("filterKategori")
    .value;

  const filtered =
    semuaBarang.filter((b) => {

      const cocokSearch =
        (b.nama || "")
        .toLowerCase()
        .includes(q)
        ||
        (b.kode || "")
        .toLowerCase()
        .includes(q);

      const cocokKategori =
        !kategori
        ||
        (b.kategori || "") === kategori;

      return cocokSearch
        && cocokKategori;

    });

  renderBarang(filtered);

}

/* STATS */

function updateStats() {

  document.getElementById("totalBarang")
  .textContent =
    semuaBarang.length;

  const stokHabis =
    semuaBarang.filter(
      b => b.stok <= 0
    );

  document.getElementById("stokHabis")
  .textContent =
    stokHabis.length;

  const kategori =
    new Set(
      semuaBarang.map(
        b => b.kategori
      )
    );

  document.getElementById("totalKategori")
  .textContent =
    kategori.size;

}

/* INIT */

loadBarang();
