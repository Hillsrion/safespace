export async function logout() {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });

    window.location.href = "/auth/login";
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    window.location.href = "/auth/login";
    return false;
  }
}
