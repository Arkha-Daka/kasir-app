import { db } from "../../database/firebase-config.js";
import { catatAktivitas } from "../../database/activity-log.js";
import { escapeHTML } from "../../database/security.js";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let laporanLoaded = false;
let kasirLoaded = false;
let laporanTransaksi = [];
let laporanBarang = [];
const loadedScripts = {};

function loadScriptOnce(src) {
  if (loadedScripts[src]) return loadedScripts[src];

  loadedScripts[src] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;

    document.head.appendChild(script);
  });

  return loadedScripts[src];
}

window.addEventListener("componentsLoaded", async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  setupSidebarModals();
});

function setupSidebarModals() {
  window.openLaporan = async function () {
    const modal = document.getElementById("laporanModal");
    if (!modal) return;

    modal.classList.add("show");

    if (!laporanLoaded) {
      laporanLoaded = true;
      try {
        await loadScriptOnce("https://cdn.jsdelivr.net/npm/chart.js");
      } catch (err) {
        console.warn("Chart.js belum bisa dimuat:", err);
      }
      await loadLaporanSidebar();
    }
  };

  window.openSetting = async function () {
    const modal = document.getElementById("settingModal");
    if (!modal) return;

    modal.classList.add("show");

    if (!kasirLoaded) {
      kasirLoaded = true;
      await loadKasirSidebar();
    }
  };
}

async function loadLaporanSidebar() {
  try {
    if (!document.getElementById("laporanTransaksi")) return;

    const transaksiSnap = await getDocs(collection(db, "transaksi"));
    const barangSnap = await getDocs(collection(db, "barang"));

    laporanTransaksi = [];
    laporanBarang = [];

    transaksiSnap.forEach((item) => {
      laporanTransaksi.push({
        id: item.id,
        ...item.data()
      });
    });

    barangSnap.forEach((item) => {
      laporanBarang.push({
        id: item.id,
        ...item.data()
      });
    });

    renderLaporan(laporanTransaksi);

    try {
      const stokLogSnap = await getDocs(
        query(
          collection(db, "stokLog"),
          orderBy("createdAt", "desc"),
          limit(8)
        )
      );

      renderStokLog(stokLogSnap);
    } catch (err) {
      console.warn("Gagal memuat riwayat stok:", err);
      const el = document.getElementById("stokLogList");
      if (el) el.innerHTML = "Riwayat stok belum bisa dimuat";
    }
  } catch (err) {
    console.error("loadLaporanSidebar error:", err);
  }
}

function renderStokLog(snap) {
  const el = document.getElementById("stokLogList");
  if (!el) return;

  if (snap.empty) {
    el.innerHTML = "Belum ada riwayat stok";
    return;
  }

  el.innerHTML = "";

  snap.forEach((item) => {
    const data = item.data();
    const tanda = data.tipe === "masuk" ? "+" : "-";

    el.innerHTML += `
      <div class="top-product-item">
        <span>${escapeHTML(data.nama || "-")}</span>
        <b>${escapeHTML(tanda)}${escapeHTML(data.qty || 0)} | ${escapeHTML(data.stokSebelum || 0)} ke ${escapeHTML(data.stokSesudah || 0)}</b>
      </div>
    `;
  });
}

function transaksiTime(data) {
  return data.timestamp?.toMillis?.()
    || Date.parse(data.tanggal)
    || 0;
}

function getFilteredLaporan() {
  const startValue = document.getElementById("laporanStart")?.value;
  const endValue = document.getElementById("laporanEnd")?.value;

  const start = startValue
    ? new Date(`${startValue}T00:00:00`).getTime()
    : 0;

  const end = endValue
    ? new Date(`${endValue}T23:59:59`).getTime()
    : Infinity;

  return laporanTransaksi.filter((trx) => {
    const waktu = transaksiTime(trx);
    return waktu >= start && waktu <= end;
  });
}

function renderLaporan(data) {
  let omzet = 0;
  let totalProduk = 0;
  const produkTerjual = {};

  data.forEach((trx) => {
    omzet += Number(trx.total || 0);

    if (!trx.items) return;

    trx.items.forEach((item) => {
      const qty = Number(item.qty || 1);
      totalProduk += qty;

      if (!produkTerjual[item.nama]) {
        produkTerjual[item.nama] = 0;
      }

      produkTerjual[item.nama] += qty;
    });
  });

  const stokMenipis = laporanBarang.filter(
    (item) => Number(item.stok || 0) <= 5
  ).length;

  document.getElementById("laporanTransaksi").textContent = data.length;
  document.getElementById("laporanOmzet").textContent =
    "Rp " + omzet.toLocaleString("id-ID");
  document.getElementById("laporanProduk").textContent = totalProduk;
  document.getElementById("laporanStok").textContent = stokMenipis;

  const sortedProduk = Object.entries(produkTerjual)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  document.getElementById("topProductList").innerHTML =
    sortedProduk.map((item) => `
      <div class="top-product-item">
        <span>${escapeHTML(item[0])}</span>
        <b>Terjual: ${escapeHTML(item[1])}</b>
      </div>
    `).join("") || "Belum ada data";

  if (typeof window.renderSalesChart === "function") {
    window.renderSalesChart("salesChart", data);
  }
}

window.filterLaporan = function () {
  renderLaporan(getFilteredLaporan());
};

window.exportLaporanCSV = function () {
  const data = getFilteredLaporan();
  const rows = [
    [
      "Invoice",
      "Tanggal",
      "Kasir",
      "Metode",
      "Subtotal",
      "Diskon",
      "PPN",
      "Total"
    ],
    ...data.map((trx) => [
      trx.invoice || "",
      trx.tanggal || "",
      trx.kasir || "",
      trx.metode || "",
      trx.subtotal || 0,
      trx.diskon || 0,
      trx.ppn || 0,
      trx.total || 0
    ])
  ];

  const csv = rows.map((row) =>
    row.map((cell) =>
      `"${String(cell).replaceAll('"', '""')}"`
    ).join(",")
  ).join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "laporan-transaksi.csv";
  link.click();

  URL.revokeObjectURL(url);
};

window.printLaporan = function () {
  window.print();
};

async function loadKasirSidebar() {
  const list = document.getElementById("kasirList");
  if (!list) return;

  try {
    list.innerHTML = "Memuat data...";

    const snap = await getDocs(collection(db, "kasir"));
    list.innerHTML = "";

    if (snap.empty) {
      list.innerHTML = "Belum ada akun kasir";
      return;
    }

    snap.forEach((item) => {
      const data = item.data();
      list.innerHTML += `
        <div class="barang-item">
          <span>${escapeHTML(data.nama || data.username)}</span>
          <b>${escapeHTML(data.role || "kasir")} | ${data.aktif === false ? "nonaktif" : "aktif"}</b>
        </div>
      `;
    });
  } catch (err) {
    console.error("loadKasirSidebar error:", err);
    list.innerHTML = "Gagal memuat data";
  }
}

window.tambahKasir = async function () {
  const nama = document.getElementById("kasirNama").value.trim();
  const username = document.getElementById("kasirUsername").value.trim();
  const password = document.getElementById("kasirPassword").value.trim();
  const role = document.getElementById("kasirRole").value;
  const aktif = document.getElementById("kasirAktif").checked;

  if (!nama || !username || !password) {
    alert("Isi nama, username, dan password");
    return;
  }

  try {
    const kasirRef = await addDoc(
      collection(db, "kasir"),
      {
        nama,
        username,
        password,
        role,
        aktif,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    await catatAktivitas({
      tipe: "kasir",
      judul: `Akun kasir ${username} dibuat`,
      deskripsi: "Admin menambahkan akun kasir baru",
      refId: kasirRef.id,
      meta: { nama, username, role, aktif }
    });

    alert("Akun kasir berhasil dibuat");

    document.getElementById("kasirNama").value = "";
    document.getElementById("kasirUsername").value = "";
    document.getElementById("kasirPassword").value = "";
    document.getElementById("kasirRole").value = "kasir";
    document.getElementById("kasirAktif").checked = true;

    await loadKasirSidebar();
    kasirLoaded = true;
  } catch (err) {
    console.error(err);
    alert("Gagal membuat akun");
  }
};

window.ubahPasswordAdmin = async function () {
  const username = prompt("Masukkan username admin");
  if (!username) return;

  const newPassword = prompt("Masukkan password baru");
  if (!newPassword) return;

  try {
    const adminQuery = query(
      collection(db, "admin"),
      where("username", "==", username)
    );

    const snap = await getDocs(adminQuery);

    if (snap.empty) {
      alert("Admin tidak ditemukan");
      return;
    }

    const adminDoc = snap.docs[0];

    await updateDoc(
      doc(db, "admin", adminDoc.id),
      {
        password: newPassword,
        updatedAt: serverTimestamp()
      }
    );

    alert("Password admin berhasil diubah");
  } catch (err) {
    console.error(err);
    alert("Gagal ubah password");
  }
};
