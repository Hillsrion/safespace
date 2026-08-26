import { describe, expect, it, vi } from "vitest";
import { R2MediaStorage } from "./media-storage.server";

const key = `evidence/v1/${"A".repeat(43)}.jpg`;
const fixedDate = new Date("2026-08-25T12:34:56.000Z");

function storage(fetchImplementation: typeof fetch) {
  return new R2MediaStorage(
    {
      accountId: "account-id",
      accessKeyId: "access-id",
      secretAccessKey: "super-secret-value",
      bucketName: "private-evidence",
      signedUrlTtlSeconds: 45,
    },
    fetchImplementation,
    () => fixedDate
  );
}

describe("Cloudflare R2 private storage", () => {
  it("uploads with AWS SigV4 authorization and no public URL", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const r2 = storage(fetchMock as unknown as typeof fetch);
    await r2.putObject({
      key,
      body: Uint8Array.from([1, 2, 3]),
      contentType: "image/jpeg",
      contentDisposition: "inline",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://account-id.r2.cloudflarestorage.com/private-evidence/${key}`
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toContain("AWS4-HMAC-SHA256 Credential=access-id/");
    expect(headers.get("Authorization")).not.toContain("super-secret-value");
    expect(headers.get("x-amz-content-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a tightly expiring signed URL whose signature excludes the secret", async () => {
    const r2 = storage(vi.fn() as unknown as typeof fetch);
    const signed = new URL(
      await r2.createSignedDownloadUrl({
        key,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      })
    );
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("45");
    expect(signed.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.toString()).not.toContain("super-secret-value");
  });

  it("forwards a single range on the signed private GET", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(Uint8Array.from([1, 2]), {
        status: 206,
        headers: { "Content-Length": "2", "Content-Range": "bytes 0-1/10" },
      })
    );
    const object = await storage(fetchMock as unknown as typeof fetch).getObject(key, {
      range: "bytes=0-1",
    });
    const requestHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(requestHeaders.Range).toBe("bytes=0-1");
    expect(object.status).toBe(206);
    expect(object.contentRange).toBe("bytes 0-1/10");
  });
});
