import { db }
from "../../database/firebase-config.js";
import {
  escapeHTML,
  requireRole
}
from "../../database/security.js";

import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireRole("admin", "../html/login-admin.html");

let dashboardRefreshTimer = null;
let dashboardIsLoading = false;
let dashboardNeedsRefresh = false;

/* ===================================
   DATE
=================================== */

const today = new Date();

document.getElementById("todayDate").textContent =
  today.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

function getValidDate(data) {

  const firestoreDate =
    data.timestamp?.toDate?.();

  if (
    firestoreDate instanceof Date
    &&
    !Number.isNaN(firestoreDate.getTime())
  ) {
    return firestoreDate;
  }

  const parsedDate =
    new Date(data.tanggal || 0);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return null;

}

function setText(id, value) {

  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = value;
  }

}

function awalHari(date = new Date()) {

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

}

async function getCountSafe(targetQuery) {

  try {

    const snap =
      await getCountFromServer(targetQuery);

    return snap.data().count || 0;

  } catch (error) {

    console.warn("Gagal mengambil count:", error);
    return 0;

  }

}

async function getSafeDocs(collectionName) {

  try {

    return await getDocs(
      collection(db, collectionName)
    );

  } catch (error) {

    console.warn(
      `Koleksi ${collectionName} belum bisa dimuat:`,
      error
    );

    return null;

  }

}

/* ===================================
   INIT — tunggu sidebar selesai load
=================================== */

window.addEventListener("componentsLoaded", async () => {

  await loadDashboard();
  setupRealtimeDashboard();

});

/* ===================================
   LOAD DASHBOARD
=================================== */

async function loadDashboard() {

  if (dashboardIsLoading) {
    dashboardNeedsRefresh = true;
    return;
  }

  dashboardIsLoading = true;

  await Promise.allSettled([
    loadBarang(),
    loadTransaksi(),
    loadAktivitas()
  ]);

  dashboardIsLoading = false;

  if (dashboardNeedsRefresh) {
    dashboardNeedsRefresh = false;
    scheduleDashboardRefresh();
  }

}

function scheduleDashboardRefresh() {
  clearTimeout(dashboardRefreshTimer);

  dashboardRefreshTimer = setTimeout(() => {
    loadDashboard();
  }, 600);
}

function setupRealtimeDashboard() {
  const realtimeSources = [
    {
      name: "transaksi",
      source: query(
        collection(db, "transaksi"),
        orderBy("timestamp", "desc"),
        limit(1)
      )
    },
    {
      name: "barang",
      source: query(
        collection(db, "barang"),
        where("stok", "<=", 5),
        limit(25)
      )
    },
    {
      name: "aktivitas",
      source: query(
        collection(db, "aktivitas"),
        orderBy("createdAt", "desc"),
        limit(1)
      )
    }
  ];

  realtimeSources.forEach(({ name, source }) => {
    let isFirstSnapshot = true;

    onSnapshot(
      source,
      () => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }

        scheduleDashboardRefresh();
      },
      (error) => {
        console.warn(`Realtime ${name} gagal:`, error);
      }
    );
  });
}

/* ===================================
   BARANG
=================================== */

async function loadBarang() {

  const stokList =
    document.getElementById(
      "stokMenipisList"
    );

  stokList.innerHTML = "";

  let stokSnap;
  let barangTerbaruSnap;
  let totalBarang = 0;
  let barangHabis = 0;

  try {

    const barangRef =
      collection(db, "barang");

    [
      totalBarang,
      barangHabis,
      stokSnap,
      barangTerbaruSnap
    ] = await Promise.all([
      getCountSafe(barangRef),
      getCountSafe(
        query(
          barangRef,
          where("stok", "<=", 0)
        )
      ),
      getDocs(
        query(
          barangRef,
          where("stok", "<=", 5),
          orderBy("stok", "asc"),
          limit(25)
        )
      ),
      getDocs(
        query(
          barangRef,
          orderBy("createdAt", "desc"),
          limit(3)
        )
      )
    ]);

  } catch (error) {

    console.error("Gagal memuat barang:", error);

    setText("totalBarang", "0");
    setText("barangHabis", "0");

    stokList.innerHTML = `
      <div class="notif-item">
        Stok belum bisa dimuat
      </div>
    `;

    document.getElementById(
      "barangList"
    ).innerHTML = `
      <div class="barang-item">
        Barang belum bisa dimuat
      </div>
    `;

    return;

  }

  setText("totalBarang", totalBarang);

  const barangList =
    document.getElementById(
      "barangList"
    );

  barangList.innerHTML = "";

  let count = 0;

  setText(
    "barangHabis",
    barangHabis
  );

  stokSnap.forEach((doc) => {

    /* STOK MENIPIS */

    const data = doc.data();

    stokList.innerHTML += `
      <div class="notif-item">

        <span>
          ${escapeHTML(data.nama)}
        </span>

        <span class="notif-stock">
          Sisa ${escapeHTML(data.stok)}
        </span>

      </div>
    `;

  });

  const renderBarangTerbaru = (doc) => {

    /* BARANG TERBARU */

    if (count >= 3) return;

    const data = doc.data();

    barangList.innerHTML += `
      <div class="barang-item">

        <div>

          <div class="barang-name">
            ${escapeHTML(data.nama)}
          </div>

          <div class="barang-price">
            Rp ${Number(data.harga)
              .toLocaleString("id-ID")}
          </div>

        </div>

        <div>📦</div>

      </div>
    `;

    count++;

  };

  barangTerbaruSnap.forEach(renderBarangTerbaru);

  if (count === 0 && totalBarang > 0) {

    try {

      const fallbackSnap =
        await getDocs(
          query(
            collection(db, "barang"),
            limit(3)
          )
        );

      fallbackSnap.forEach(renderBarangTerbaru);

    } catch (error) {

      console.warn("Gagal memuat fallback barang:", error);

    }

  }

  if (barangList.innerHTML === "") {

    barangList.innerHTML = `
      <div class="barang-item">
        Belum ada barang
      </div>
    `;

  }

  /* EMPTY NOTIF */

  if (stokList.innerHTML === "") {

    stokList.innerHTML = `
      <div class="notif-item">

        ✅ Semua stok aman

      </div>
    `;
  }

}

/* ===================================
   TRANSAKSI
=================================== */

async function loadTransaksi() {

  let totalTransaksiCount = 0;
  let todaySnap;
  let weekSnap;
  let monthSnap;
  let recentSnap;

  try {

    const transaksiRef =
      collection(db, "transaksi");

    const now = new Date();
    const awalMinggu = new Date(now);
    awalMinggu.setDate(now.getDate() - now.getDay());
    awalMinggu.setHours(0, 0, 0, 0);
    const awalBulan =
      new Date(now.getFullYear(), now.getMonth(), 1);

    [
      totalTransaksiCount,
      todaySnap,
      weekSnap,
      monthSnap,
      recentSnap
    ] = await Promise.all([
      getCountSafe(transaksiRef),
      getDocs(
        query(
          transaksiRef,
          where("timestamp", ">=", awalHari())
        )
      ),
      getDocs(
        query(
          transaksiRef,
          where("timestamp", ">=", awalMinggu)
        )
      ),
      getDocs(
        query(
          transaksiRef,
          where("timestamp", ">=", awalBulan)
        )
      ),
      getDocs(
        query(
          transaksiRef,
          orderBy("timestamp", "desc"),
          limit(3)
        )
      )
    ]);

  } catch (error) {

    console.error("Gagal memuat transaksi:", error);

    setText("totalTransaksi", "0");
    setText("totalOmzet", "Rp 0");
    setText("omzetMinggu", "Rp 0");
    setText("omzetBulan", "Rp 0");
    setText("produkTerlaris", "-");

    const tbody =
      document.getElementById(
        "recentTransactions"
      );

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3">Transaksi belum bisa dimuat</td>
        </tr>
      `;
    }

    return;

  }

  const transaksi = [];

  let totalOmzet = 0;
  let omzetMinggu = 0;
  let omzetBulan = 0;
  const produkMap = {};

  todaySnap.forEach((doc) => {

    const data = doc.data();
    const total =
      Number(data.total || 0);

    totalOmzet += total;

  });

  weekSnap.forEach((doc) => {

    const data = doc.data();

    omzetMinggu +=
      Number(data.total || 0);

  });

  monthSnap.forEach((doc) => {

    const data = doc.data();

    omzetBulan +=
      Number(data.total || 0);

    data.items?.forEach((item) => {

      if (!produkMap[item.nama]) {
        produkMap[item.nama] = 0;
      }

      produkMap[item.nama] +=
        Number(item.qty || 1);

    });

  });

  const renderRecentTransaksi = (doc) => {

    const data = doc.data();
    const waktu =
      getValidDate(data);

    transaksi.push({
      ...data,
      waktu:
        data.timestamp?.toMillis?.()
        ||
        waktu?.getTime?.()
        ||
        0
    });

  };

  recentSnap.forEach(renderRecentTransaksi);

  if (!transaksi.length && totalTransaksiCount > 0) {

    try {

      const fallbackSnap =
        await getDocs(
          query(
            collection(db, "transaksi"),
            limit(3)
          )
        );

      fallbackSnap.forEach(renderRecentTransaksi);

    } catch (error) {

      console.warn("Gagal memuat fallback transaksi:", error);

    }

  }

  /* SORT TERBARU */

  transaksi.sort(
    (a, b) => b.waktu - a.waktu
  );

  /* TOTAL */

  setText(
    "totalTransaksi",
    totalTransaksiCount
  );

  setText(
    "totalOmzet",
    "Rp " +
    totalOmzet.toLocaleString("id-ID")
  );

  setText(
    "omzetMinggu",
    "Rp " +
    omzetMinggu.toLocaleString("id-ID")
  );

  setText(
    "omzetBulan",
    "Rp " +
    omzetBulan.toLocaleString("id-ID")
  );

  const topProduk =
    Object.entries(produkMap)
    .sort((a, b) => b[1] - a[1])[0];

  setText(
    "produkTerlaris",
    topProduk
      ? `${topProduk[0]} (${topProduk[1]})`
      : "-"
  );

  /* TABLE */

  const tbody =
    document.getElementById(
      "recentTransactions"
    );

  tbody.innerHTML = "";

  if (!transaksi.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3">Belum ada transaksi</td>
      </tr>
    `;
    return;
  }

  transaksi
    .slice(0, 3)
    .forEach((data) => {

      tbody.innerHTML += `
        <tr>

          <td>
            ${escapeHTML(data.invoice || "-")}
          </td>

          <td>
            Rp ${Number(data.total || 0)
              .toLocaleString("id-ID")}
          </td>

          <td>
            ${escapeHTML(data.tanggal || "-")}
          </td>

        </tr>
      `;

    });

}

/* ===================================
   AKTIVITAS TERBARU
=================================== */

async function loadAktivitas() {

  const aktivitasList =
    document.getElementById(
      "aktivitasList"
    );

  aktivitasList.innerHTML = "";

  let aktivitasSnap;

  try {

    const aktivitasQuery =
      query(
        collection(db, "aktivitas"),
        orderBy("createdAt", "desc"),
        limit(6)
      );

    aktivitasSnap =
      await getDocs(aktivitasQuery);

  } catch (error) {

    console.warn(
      "Aktivitas baru belum bisa dimuat, pakai data lama:",
      error
    );

    await loadAktivitasLegacySafe(aktivitasList);
    return;

  }

  if (!aktivitasSnap.empty) {

    aktivitasSnap.forEach((doc) => {

      const data = doc.data();

      aktivitasList.innerHTML += `
        <div class="aktivitas-item">

          <b>${escapeHTML(data.judul || "Aktivitas")}</b>

          ${data.deskripsi
            ? `<div>${escapeHTML(data.deskripsi)}</div>`
            : ""}

        </div>
      `;

    });

    return;

  }

  await loadAktivitasLegacySafe(aktivitasList);

}

async function loadAktivitasLegacySafe(aktivitasList) {

  try {

    await loadAktivitasLegacy(aktivitasList);

  } catch (error) {

    console.error("Gagal memuat aktivitas fallback:", error);

    aktivitasList.innerHTML = `
      <div class="aktivitas-item">
        Aktivitas belum bisa dimuat
      </div>
    `;

  }

}

/* ===================================
   FALLBACK AKTIVITAS LAMA
=================================== */

async function loadAktivitasLegacy(aktivitasList) {

  const aktivitas = [];

  /* =========================
     TRANSAKSI
  ========================= */

  const transaksiSnap =
    await getSafeDocs("transaksi");

  transaksiSnap?.forEach((doc) => {

    const data = doc.data();

    aktivitas.push({

      waktu:
        data.timestamp?.toMillis?.() || 0,

      html: `
        <div class="aktivitas-item">

          💰 Transaksi
          <b>${escapeHTML(data.invoice || "-")}</b>

          sebesar

          Rp ${Number(data.total || 0)
            .toLocaleString("id-ID")}

        </div>
      `

    });

  });

  /* =========================
     BARANG BARU
  ========================= */

  const barangSnap =
    await getSafeDocs("barang");

  barangSnap?.forEach((doc) => {

    const data = doc.data();

    /* BARANG DITAMBAHKAN */

    aktivitas.push({

      waktu:
        data.createdAt?.toMillis?.() || 0,

      html: `
        <div class="aktivitas-item">

          📦 Barang baru
          <b>${escapeHTML(data.nama)}</b>

          ditambahkan

        </div>
      `

    });

    /* STOK MENIPIS */

    if (Number(data.stok || 0) <= 5) {

      aktivitas.push({

        waktu:
          data.updatedAt?.toMillis?.()
          ||
          data.createdAt?.toMillis?.()
          ||
          0,

        html: `
          <div class="aktivitas-item">

            ⚠️ Stok
            <b>${escapeHTML(data.nama)}</b>

            hampir habis
            (sisa ${escapeHTML(data.stok)})

          </div>
        `

      });

    }

  });

  /* =========================
     KASIR
  ========================= */

  const kasirSnap =
    await getSafeDocs("kasir");

  kasirSnap?.forEach((doc) => {

    const data = doc.data();

    aktivitas.push({

      waktu:
        data.createdAt?.toMillis?.() || 0,

      html: `
        <div class="aktivitas-item">

          👤 Kasir
          <b>${escapeHTML(data.username)}</b>

          ditambahkan

        </div>
      `

    });

  });

  /* =========================
     SORT TERBARU
  ========================= */

  aktivitas.sort(
    (a, b) => b.waktu - a.waktu
  );

  /* =========================
     TAMPILKAN 6 DATA
  ========================= */

  aktivitas
    .slice(0, 6)
    .forEach((item) => {

      aktivitasList.innerHTML +=
        item.html;

    });

  if (aktivitasList.innerHTML === "") {

    aktivitasList.innerHTML = `
      <div class="aktivitas-item">
        Belum ada aktivitas
      </div>
    `;

  }

}
