import { db }
from "../../database/firebase-config.js";
import { catatAktivitas }
from "../../database/activity-log.js";
import { saveLoginUser }
from "../../database/security.js";

import {
  collection,
  getDocs,
  query,
  where
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =========================
   LOGIN
========================= */

const loginBtn =
  document.getElementById(
    "loginBtn"
  );

loginBtn.addEventListener(
  "click",
  loginKasir
);

async function loginKasir() {

  const username =
    document.getElementById(
      "username"
    ).value.trim();

  const password =
    document.getElementById(
      "password"
    ).value.trim();

  const errorText =
    document.getElementById(
      "errorText"
    );

  errorText.textContent = "";

  if (!username || !password) {

    errorText.textContent =
      "Isi username dan password";

    return;

  }

  try {

    const q = query(
      collection(db, "kasir"),
      where(
        "username",
        "==",
        username
      ),
      where(
        "password",
        "==",
        password
      )
    );

    const snap =
      await getDocs(q);

    if (snap.empty) {

      errorText.textContent =
        "Username atau password salah";

      return;

    }

    const kasirDoc =
      snap.docs[0];

    const kasirData =
      kasirDoc.data();

    if (kasirData.aktif === false) {

      errorText.textContent =
        "Akun kasir nonaktif";

      return;

    }

    await catatAktivitas({
      tipe: "login",
      judul: `Kasir ${username} login`,
      deskripsi: "Kasir berhasil masuk ke aplikasi",
      refId: kasirDoc.id,
      meta: {
        username
      }
    });

    saveLoginUser(
      {
        ...kasirData,
        username
      },
      "kasir"
    );

    /* REDIRECT */
    window.location.href =
      "../html/kasir.html";

  } catch (err) {

    console.error(err);

    errorText.textContent =
      "Terjadi kesalahan";

  }

}
