/** Must match server/form-api.mjs ALLOWED_FORMS */
export type SiteFormId = "contact" | "riders-signup" | "vendors-apply" | "affiliate" | "book-a-call" | "delete-account";

const endpoint = process.env.NEXT_PUBLIC_FORM_API_URL ?? "/api/form-submit";

export async function submitSiteForm(formId: SiteFormId, fields: Record<string, string>): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formId, fields }),
  });
  let body: { error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Could not send. Try again.");
  }
}
