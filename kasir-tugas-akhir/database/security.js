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

  localStorage.setItem("loginUser", JSON.stringify(safeUser));
  return safeUser;
}

export function getLoginUser() {
  try {
    return JSON.parse(localStorage.getItem("loginUser") || "null");
  } catch {
    return null;
  }
}

export function clearLoginUser() {
  localStorage.removeItem("loginUser");
  localStorage.removeItem("kasirLogin");
  localStorage.removeItem("kasirUsername");
  localStorage.removeItem("kasirNama");
}

export function requireRole(role, redirectPath) {
  const user = getLoginUser();

  if (
    !user ||
    user.isLoggedIn !== true ||
    user.role !== role ||
    !user.username ||
    user.aktif === false
  ) {
    clearLoginUser();
    window.location.href = redirectPath;
    throw new Error("Akses ditolak");
  }

  return user;
}
