/* ═══════════════════════════════════════
   LOAD COMPONENT
═══════════════════════════════════════ */

import {
  clearLoginUser,
  requireRole
} from "../../database/security.js";

async function loadComponent(id, file) {

  const el =
    document.getElementById(id);

  if (!el) return;

  try {

    const res =
      await fetch(file);

    const html =
      await res.text();

    el.innerHTML = html;

  } catch (err) {

    console.error(
      "Gagal load component:",
      file
    );

  }

}

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */

window.addEventListener(
  "DOMContentLoaded",
  async () => {

    requireRole("admin", "../html/login-admin.html");

    /* SIDEBAR */
    await loadComponent(
      "sidebar",
      "../components/sidebar.html"
    );

    /* TOPBAR */
    await loadComponent(
      "topbar",
      "../components/topbar.html"
    );

    /* THEME */
    initTheme();

    /* BUTTON */
    initSidebarButtons();

    /* MODAL */
    initModalOutsideClick();

    /* KASIH TAU COMPONENT SUDAH READY */
   setTimeout(() => {
  window.dispatchEvent(new Event("componentsLoaded"));
}, 50);

  }
);

/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */

function initTheme() {

  const savedTheme =
    localStorage.getItem("theme");

  if (savedTheme === "dark") {

    document.body.classList.add(
      "dark"
    );

  } else {

    document.body.classList.remove(
      "dark"
    );

  }

  setupThemeButton();

}

/* BUTTON THEME */

function setupThemeButton() {

  const btn =
    document.getElementById(
      "toggleTheme"
    );

  if (!btn) return;

  updateThemeIcon();

  btn.replaceWith(
    btn.cloneNode(true)
  );

  const newBtn =
    document.getElementById(
      "toggleTheme"
    );

  newBtn.addEventListener(
    "click",
    () => {

      document.body.classList.toggle(
        "dark"
      );

      const isDark =
        document.body.classList.contains(
          "dark"
        );

      localStorage.setItem(
        "theme",
        isDark
          ? "dark"
          : "light"
      );

      updateThemeIcon();

    }
  );

}

function updateThemeIcon() {

  const btn =
    document.getElementById(
      "toggleTheme"
    );

  if (!btn) return;

  btn.textContent =
    document.body.classList.contains(
      "dark"
    )
      ? "☀️"
      : "🌙";

}

/* ═══════════════════════════════════════
   SIDEBAR ACTIVE
═══════════════════════════════════════ */

function initSidebarButtons() {

  const buttons =
    document.querySelectorAll(
      ".sidebar-btn"
    );

  buttons.forEach((btn) => {

    btn.addEventListener(
      "click",
      () => {

        buttons.forEach((b) => {

          b.classList.remove(
            "active"
          );

        });

        btn.classList.add(
          "active"
        );

      }
    );

  });

}

/* ═══════════════════════════════════════
   MODAL
═══════════════════════════════════════ */

window.openLaporan =
function () {

  const modal =
    document.getElementById(
      "laporanModal"
    );

  if (!modal) return;

  modal.classList.add("show");

};

window.closeLaporan =
function () {

  const modal =
    document.getElementById(
      "laporanModal"
    );

  if (!modal) return;

  modal.classList.remove("show");

};

window.openSetting =
function () {

  const modal =
    document.getElementById(
      "settingModal"
    );

  if (!modal) return;

  modal.classList.add("show");

};

window.closeSetting =
function () {

  const modal =
    document.getElementById(
      "settingModal"
    );

  if (!modal) return;

  modal.classList.remove("show");

};

/* ═══════════════════════════════════════
   OUTSIDE CLICK
═══════════════════════════════════════ */

function initModalOutsideClick() {

  window.addEventListener(
    "click",
    (e) => {

      const laporanModal =
        document.getElementById(
          "laporanModal"
        );

      const settingModal =
        document.getElementById(
          "settingModal"
        );

      if (
        laporanModal &&
        e.target === laporanModal
      ) {

        closeLaporan();

      }

      if (
        settingModal &&
        e.target === settingModal
      ) {

        closeSetting();

      }

    }
  );

}

/* ESC */

window.addEventListener(
  "keydown",
  (e) => {

    if (e.key === "Escape") {

      closeLaporan();

      closeSetting();

    }

  }
);

window.logoutAdmin =
function () {

  clearLoginUser();

  window.location.href =
    "../html/login-admin.html";

};
