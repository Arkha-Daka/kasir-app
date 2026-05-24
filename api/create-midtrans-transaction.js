const { setCors } = require("./_lib/cors");
const { getAuthHeader, getSnapBaseUrl } = require("./_lib/midtrans");

function cleanText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 255);
}

function normalizeItems(items, grossAmount) {
  if (!Array.isArray(items)) {
    return undefined;
  }

  const normalized = items
    .map((item, index) => {
      const price = Math.round(Number(item.price || item.harga || 0));
      const quantity = Math.max(1, Math.round(Number(item.quantity || item.qty || 1)));
      const name = cleanText(item.name || item.nama, `Item ${index + 1}`);
      const id = cleanText(item.id || item.kode || `item-${index + 1}`);

      if (!price || price < 1 || !name) {
        return null;
      }

      return {
        id,
        price,
        quantity,
        name
      };
    })
    .filter(Boolean);

  const itemTotal = normalized.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return itemTotal === grossAmount && normalized.length
    ? normalized
    : undefined;
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
    const body = getJsonBody(req);
    const grossAmount = Math.round(Number(body.grossAmount || body.total || 0));

    if (!grossAmount || grossAmount < 1) {
      res.status(400).json({ error: "Total transaksi tidak valid" });
      return;
    }

    const orderId = cleanText(
      body.orderId || body.invoice,
      `INV-${Date.now()}`
    );

    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount
      },
      item_details: normalizeItems(body.items, grossAmount),
      customer_details: {
        first_name: cleanText(body.customerName || body.kasir, "Pelanggan")
      },
      custom_field1: cleanText(body.transaksiId || ""),
      custom_field2: cleanText(body.kasir || "")
    };

    const response = await fetch(`${getSnapBaseUrl()}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: getAuthHeader(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({
        error: "Gagal membuat transaksi Midtrans",
        detail: data
      });
      return;
    }

    res.status(200).json({
      orderId,
      token: data.token,
      redirectUrl: data.redirect_url,
      clientKey: process.env.MIDTRANS_CLIENT_KEY || ""
    });
  } catch (err) {
    console.error("create-midtrans-transaction error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
