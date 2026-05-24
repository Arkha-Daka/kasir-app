const { setCors } = require("./_lib/cors");
const { getDb, getFirebaseAdmin } = require("./_lib/firebase-admin");
const { getTransactionStatus, verifySignature } = require("./_lib/midtrans");

function mapPaymentStatus(midtransStatus, fraudStatus) {
  if (midtransStatus === "capture") {
    return fraudStatus === "challenge" ? "Challenge" : "Selesai";
  }

  if (midtransStatus === "settlement") return "Selesai";
  if (midtransStatus === "pending") return "Pending";
  if (midtransStatus === "expire") return "Kadaluarsa";
  if (midtransStatus === "cancel") return "Dibatalkan";
  if (midtransStatus === "deny") return "Ditolak";
  if (midtransStatus === "failure") return "Gagal";
  if (midtransStatus === "refund") return "Refund";
  if (midtransStatus === "partial_refund") return "Refund Sebagian";

  return midtransStatus || "Unknown";
}

async function findTransactionRef(db, orderId) {
  const byInvoice = await db
    .collection("transaksi")
    .where("invoice", "==", orderId)
    .limit(1)
    .get();

  if (!byInvoice.empty) {
    return byInvoice.docs[0].ref;
  }

  const byMidtransOrder = await db
    .collection("transaksi")
    .where("midtrans.orderId", "==", orderId)
    .limit(1)
    .get();

  if (!byMidtransOrder.empty) {
    return byMidtransOrder.docs[0].ref;
  }

  return null;
}

function getJsonBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  return req.body || {};
}

function isPaidStatus(paymentStatus) {
  return paymentStatus === "Selesai";
}

async function updateTransactionFromMidtrans({
  admin,
  db,
  transactionRef,
  status,
  paymentStatus
}) {
  const FieldValue = admin.firestore.FieldValue;
  let stockUpdated = false;

  await db.runTransaction(async (trx) => {
    const transactionSnap = await trx.get(transactionRef);

    if (!transactionSnap.exists) {
      return;
    }

    const transactionData = transactionSnap.data();
    const items = Array.isArray(transactionData.items)
      ? transactionData.items
      : [];

    const validItems = items
      .map((item) => ({
        id: item.id,
        kode: item.kode || "",
        nama: item.nama || "-",
        qty: Math.max(1, Number(item.qty || 1))
      }))
      .filter((item) => item.id);

    const shouldUpdateStock =
      isPaidStatus(paymentStatus)
      && transactionData.midtrans?.stockUpdated !== true
      && validItems.length > 0;

    const barangRefs = shouldUpdateStock
      ? validItems.map((item) => ({
          item,
          ref: db.collection("barang").doc(item.id)
        }))
      : [];

    const barangSnaps = await Promise.all(
      barangRefs.map(({ ref }) => trx.get(ref))
    );

    const updateData = {
      statusPembayaran: paymentStatus,
      "midtrans.orderId": status.order_id,
      "midtrans.transactionId": status.transaction_id || null,
      "midtrans.paymentType": status.payment_type || null,
      "midtrans.transactionStatus": status.transaction_status || null,
      "midtrans.fraudStatus": status.fraud_status || null,
      "midtrans.grossAmount": Number(status.gross_amount || 0),
      "midtrans.updatedAt": FieldValue.serverTimestamp()
    };

    if (shouldUpdateStock) {
      updateData["midtrans.stockUpdated"] = true;
      updateData["midtrans.stockUpdatedAt"] = FieldValue.serverTimestamp();
      stockUpdated = true;
    }

    trx.update(transactionRef, updateData);

    if (!shouldUpdateStock) {
      return;
    }

    barangRefs.forEach(({ item, ref }, index) => {
      const barangSnap = barangSnaps[index];

      if (!barangSnap.exists) {
        return;
      }

      const stokSebelum = Number(barangSnap.data().stok || 0);
      const stokSesudah = Math.max(stokSebelum - item.qty, 0);

      trx.update(ref, {
        stok: stokSesudah,
        updatedAt: FieldValue.serverTimestamp()
      });

      trx.set(
        db.collection("stokLog").doc(),
        {
          barangId: item.id,
          kode: item.kode,
          nama: item.nama,
          tipe: "keluar",
          qty: item.qty,
          stokSebelum,
          stokSesudah,
          sumber: "midtrans",
          refId: transactionRef.id,
          invoice: status.order_id,
          createdAt: FieldValue.serverTimestamp()
        }
      );
    });

    trx.set(
      db.collection("aktivitas").doc(),
      {
        tipe: "transaksi",
        judul: `Transaksi ${status.order_id}`,
        deskripsi: `Midtrans ${paymentStatus}`,
        refId: transactionRef.id,
        meta: {
          invoice: status.order_id,
          metode: "Midtrans",
          statusPembayaran: paymentStatus,
          total: Number(status.gross_amount || 0)
        },
        sortTime: Date.now(),
        createdAt: FieldValue.serverTimestamp()
      }
    );
  });

  return {
    stockUpdated
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method tidak diizinkan" });
    return;
  }

  try {
    const notification = getJsonBody(req);

    if (!verifySignature(notification)) {
      res.status(401).json({ error: "Signature Midtrans tidak valid" });
      return;
    }

    const status = await getTransactionStatus(notification.order_id);
    const paymentStatus = mapPaymentStatus(
      status.transaction_status,
      status.fraud_status
    );

    const admin = getFirebaseAdmin();
    const db = getDb();
    const transactionRef = await findTransactionRef(db, status.order_id);
    let stockUpdated = false;

    if (transactionRef) {
      const result = await updateTransactionFromMidtrans({
        admin,
        db,
        transactionRef,
        status,
        paymentStatus
      });

      stockUpdated = result.stockUpdated;
    }

    res.status(200).json({
      ok: true,
      orderId: status.order_id,
      statusPembayaran: paymentStatus,
      stockUpdated,
      firestoreUpdated: Boolean(transactionRef)
    });
  } catch (err) {
    console.error("midtrans-notification error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
