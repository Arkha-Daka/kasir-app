import { db } from "./firebase-config.js";

import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function catatAktivitas({
  tipe,
  judul,
  deskripsi = "",
  refId = "",
  meta = {}
}) {
  try {
    await addDoc(
      collection(db, "aktivitas"),
      {
        tipe,
        judul,
        deskripsi,
        refId,
        meta,
        sortTime: Date.now(),
        createdAt: serverTimestamp()
      }
    );
  } catch (err) {
    console.warn("Gagal mencatat aktivitas:", err);
  }
}
