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

    if (transactionRef) {
      await transactionRef.update({
        statusPembayaran: paymentStatus,
        "midtrans.orderId": status.order_id,
        "midtrans.transactionId": status.transaction_id || null,
        "midtrans.paymentType": status.payment_type || null,
        "midtrans.transactionStatus": status.transaction_status || null,
        "midtrans.fraudStatus": status.fraud_status || null,
        "midtrans.grossAmount": Number(status.gross_amount || 0),
        "midtrans.updatedAt": admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({
      ok: true,
      orderId: status.order_id,
      statusPembayaran: paymentStatus,
      firestoreUpdated: Boolean(transactionRef)
    });
  } catch (err) {
    console.error("midtrans-notification error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
