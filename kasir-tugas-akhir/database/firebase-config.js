// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyClMhv-arDaB_8DhSQfbSI_VjJ6vdQa27s",
    authDomain: "kasir-app-a6601.firebaseapp.com",
    projectId: "kasir-app-a6601",
    storageBucket: "kasir-app-a6601.firebasestorage.app",
    messagingSenderId: "839209751925",
    appId: "1:839209751925:web:c7d093edf09aed56426f3c",
    measurementId: "G-D13327P7HP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export { db };