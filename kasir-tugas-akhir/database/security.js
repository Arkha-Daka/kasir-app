export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function saveLoginUser(user, role) {
  const safeUser = {
    username: String(user.username || ""),
    nama: String(user.nama || user.username || ""),
    role,
    aktif: user.aktif !== false,
    isLoggedIn: true,
    loginAt: Date.now()
  };

  localStorage.setItem(getLoginStorageKey(role), JSON.stringify(safeUser));
  return safeUser;
}

function getLoginStorageKey(role) {
  return role === "admin" ? "adminLoginUser" : "kasirLoginUser";
}

export function getLoginUser(role) {
  try {
    const key = role ? getLoginStorageKey(role) : "loginUser";
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function clearLoginUser(role) {
  if (role) {
    localStorage.removeItem(getLoginStorageKey(role));

    if (role === "kasir") {
      localStorage.removeItem("kasirLogin");
      localStorage.removeItem("kasirUsername");
      localStorage.removeItem("kasirNama");
    }

    return;
  }

  localStorage.removeItem("loginUser");
  localStorage.removeItem("adminLoginUser");
  localStorage.removeItem("kasirLoginUser");
  localStorage.removeItem("kasirLogin");
  localStorage.removeItem("kasirUsername");
  localStorage.removeItem("kasirNama");
}

export function requireRole(role, redirectPath) {
  const user = getLoginUser(role);

  if (
    !user ||
    user.isLoggedIn !== true ||
    user.role !== role ||
    !user.username ||
    user.aktif === false
  ) {
    clearLoginUser(role);
    window.location.href = redirectPath;
    throw new Error("Akses ditolak");
  }

  return user;
}
