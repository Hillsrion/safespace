export async function fetchLogoutApi(): Promise<boolean> {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
}
