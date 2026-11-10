/** Extract a token from pasted text or a full link; never navigate to the pasted URL. */
export function tokenFromInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try { return new URL(value).searchParams.get("token")?.trim() || null; }
    catch { return null; }
  }
  return value;
}

export class DashboardAccessError extends Error {
  constructor() { super("Dashboard access token expired"); this.name = "DashboardAccessError"; }
}

/** Detect access failures before interpreting an error payload as a graph. */
export async function readDashboardGraph(response: Pick<Response, "status" | "ok" | "json">): Promise<unknown> {
  if (response.status === 401 || response.status === 403) throw new DashboardAccessError();
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") detail = body.error;
    } catch { /* retain HTTP status for non-JSON responses */ }
    throw new Error(detail);
  }
  return response.json();
}
