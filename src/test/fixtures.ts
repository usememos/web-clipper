/** Shared test fixtures usable from both the node and jsdom vitest projects. */

export const testCreds = { instanceUrl: "https://memos.example.com", accessToken: "tok123" };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
