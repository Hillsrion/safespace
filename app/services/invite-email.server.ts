type InviteEmailInput = {
  email: string;
  inviteUrl: string;
  inviterName: string;
  role: string;
  spaceName: string;
};

export type InviteDelivery =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "failed"; reason: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export async function sendInviteEmail(
  input: InviteEmailInput
): Promise<InviteDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return { status: "not_configured" };
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: `Invitation à rejoindre ${input.spaceName}`,
        html: `<p>${escapeHtml(input.inviterName)} vous invite à rejoindre <strong>${escapeHtml(input.spaceName)}</strong> avec le rôle ${escapeHtml(input.role)}.</p><p>Cette invitation expire dans 24 heures.</p><p><a href="${escapeHtml(input.inviteUrl)}">Rejoindre SafeSpace</a></p>`,
      }),
    });
  } catch {
    return { status: "failed", reason: "Resend request failed" };
  }

  if (!response.ok) {
    return {
      status: "failed",
      reason: `Resend returned HTTP ${response.status}`,
    };
  }

  return { status: "sent" };
}
