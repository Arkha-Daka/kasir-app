# Setup Midtrans Sandbox di Vercel

Rekomendasi untuk project ini: pakai Vercel Serverless Function. Frontend tetap static, sedangkan `MIDTRANS_SERVER_KEY` dan Firebase Admin credential disimpan sebagai Environment Variables di Vercel.

## File yang disiapkan

- `api/create-midtrans-transaction.js`
  Endpoint untuk membuat Snap token.

- `api/midtrans-notification.js`
  Endpoint webhook dari Midtrans untuk update `statusPembayaran` transaksi di Firestore.

- `api/_lib/midtrans.js`
  Helper request dan verifikasi Midtrans.

- `api/_lib/firebase-admin.js`
  Helper Firebase Admin untuk update Firestore dari server.

- `.env.example`
  Contoh nama environment variable yang harus diisi di Vercel.

## Environment Variables Vercel

Isi di Vercel: Project Settings > Environment Variables.

```env
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_CLIENT_KEY=SB-Mid-client-...
MIDTRANS_IS_PRODUCTION=false

FIREBASE_PROJECT_ID=kasir-app-a6601
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kasir-app-a6601.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nISI_PRIVATE_KEY_SERVICE_ACCOUNT\n-----END PRIVATE KEY-----\n"

ALLOWED_ORIGINS=https://domain-web-kamu.vercel.app,http://127.0.0.1:5500,http://localhost:5500
```

## Cara ambil Firebase Admin credential

1. Buka Firebase Console.
2. Masuk ke Project Settings.
3. Buka tab Service Accounts.
4. Klik Generate new private key.
5. Dari file JSON yang didownload:
   - `project_id` isi ke `FIREBASE_PROJECT_ID`
   - `client_email` isi ke `FIREBASE_CLIENT_EMAIL`
   - `private_key` isi ke `FIREBASE_PRIVATE_KEY`

Pastikan newline private key tetap berbentuk `\n` saat dimasukkan ke Vercel.

## URL endpoint setelah deploy

Misal domain Vercel kamu:

```text
https://boedoetstore.vercel.app
```

Maka endpoint-nya:

```text
https://boedoetstore.vercel.app/api/create-midtrans-transaction
https://boedoetstore.vercel.app/api/midtrans-notification
```

## Setting di Dashboard Midtrans Sandbox

Di Midtrans Sandbox dashboard, isi Payment Notification URL:

```text
https://boedoetstore.vercel.app/api/midtrans-notification
```

## Contoh request create Snap token

```js
const response = await fetch("https://boedoetstore.vercel.app/api/create-midtrans-transaction", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    invoice: "INV-123",
    total: 15000,
    kasir: "Kasir",
    items: [
      {
        id: "BRG-1",
        name: "Nasi Goreng",
        price: 15000,
        quantity: 1
      }
    ]
  })
});

const data = await response.json();
console.log(data.token, data.redirectUrl);
```

## Catatan alur yang aman

Untuk integrasi berikutnya di `kasir.html`, transaksi Midtrans sebaiknya dibuat dengan status `Pending` dulu. Status menjadi `Selesai` setelah webhook Midtrans valid masuk ke endpoint `midtrans-notification`.
