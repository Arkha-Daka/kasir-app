import { db }
from "../../database/firebase-config.js";
import { saveLoginUser }
from "../../database/security.js";

import {
  collection,
  getDocs
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function login() {

  const username =
    document.getElementById("username")
    .value.trim();

  const password =
    document.getElementById("password")
    .value.trim();

  if (!username || !password) {

    alert("Isi semua field");

    return;

  }

  let found = false;

  /* CEK ADMIN */

  const adminSnap =
    await getDocs(
      collection(db, "admin")
    );

  adminSnap.forEach((doc) => {

    const user = doc.data();

    if (
      user.username === username &&
      user.password === password
    ) {

      found = true;

        saveLoginUser(
          {
            ...user,
            username
          },
          "admin"
        );

        window.location.href =
          "../html/admin.html";

    }

  });

  /* CEK KASIR */

  if (!found) {

    const kasirSnap =
      await getDocs(
        collection(db, "kasir")
      );

    kasirSnap.forEach((doc) => {

      const user = doc.data();

      if (
        user.username === username &&
        user.password === password
      ) {

        if (user.aktif === false) {
          return;
        }

        found = true;

        saveLoginUser(
          {
            ...user,
            username
          },
          "kasir"
        );

        window.location.href =
          "../../kasir/html/kasir.html";

      }

    });

  }

  /* GAGAL */

  if (!found) {

    alert("Username / Password salah");

  }

}

window.login = login;
