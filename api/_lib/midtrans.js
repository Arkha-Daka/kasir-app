const crypto = require("crypto");

function isProduction() {
  return process.env.MIDTRANS_IS_PRODUCTION === "true";
}

function getServerKey() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;

  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY belum diisi");
  }

  return serverKey;
}

function getSnapBaseUrl() {
  return isProduction()
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function getApiBaseUrl() {
  return isProduction()
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

function getAuthHeader() {
  const token = Buffer.from(`${getServerKey()}:`).toString("base64");
  return `Basic ${token}`;
}

function createSignature({ orderId, statusCode, grossAmount }) {
  return crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${getServerKey()}`)
    .digest("hex");
}

function verifySignature(notification) {
  const signatureKey = notification.signature_key;

  if (!signatureKey) {
    return false;
  }

  const expected = createSignature({
    orderId: notification.order_id,
    statusCode: notification.status_code,
    grossAmount: notification.gross_amount
  });

  return signatureKey === expected;
}

async function getTransactionStatus(orderId) {
  const response = await fetch(
    `${getApiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: getAuthHeader()
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.status_message || "Gagal cek status Midtrans");
  }

  return data;
}

module.exports = {
  createSignature,
  getAuthHeader,
  getSnapBaseUrl,
  getTransactionStatus,
  verifySignature
};
