import { createHash, createHmac } from "node:crypto";
import type { SupportedMediaMimeType } from "~/lib/media/media-policy.server";

export type StoredMediaObject = {
  acceptRanges: string | null;
  body: ReadableStream<Uint8Array> | null;
  contentLength: number | null;
  contentRange: string | null;
  contentType: string | null;
  status: number;
};

export interface MediaStorage {
  putObject(input: {
    body: Uint8Array;
    contentDisposition: string;
    contentType: SupportedMediaMimeType;
    key: string;
  }): Promise<void>;
  getObject(key: string, options?: { range?: string }): Promise<StoredMediaObject>;
  deleteObject(key: string): Promise<void>;
  createSignedDownloadUrl(input: {
    contentDisposition: string;
    contentType: string;
    expiresInSeconds?: number;
    key: string;
  }): Promise<string>;
}

export type R2MediaStorageConfig = {
  accessKeyId: string;
  accountId: string;
  bucketName: string;
  endpoint?: string;
  secretAccessKey: string;
  signedUrlTtlSeconds?: number;
};

export class MediaStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaStorageConfigurationError";
  }
}

export class MediaStorageError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "MediaStorageError";
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeObjectPath(value: string): string {
  return value.split("/").map(awsEncode).join("/");
}

function canonicalQuery(parameters: Iterable<[string, string]>): string {
  return [...parameters]
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function amzTimestamp(now: Date): { date: string; timestamp: string } {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { date: timestamp.slice(0, 8), timestamp };
}

function signingKey(secret: string, date: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function assertStorageKey(key: string): void {
  if (!/^evidence\/v1\/[A-Za-z0-9_-]{43}\.(?:jpg|png|webp|gif|mp3|wav|mp4|mov)$/.test(key)) {
    throw new MediaStorageError("Invalid private media storage key");
  }
}

function validateConfig(config: R2MediaStorageConfig): Required<R2MediaStorageConfig> {
  const endpoint = config.endpoint?.trim() || `https://${config.accountId}.r2.cloudflarestorage.com`;
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new MediaStorageConfigurationError("R2 endpoint is invalid");
  }
  if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.search || parsedEndpoint.hash) {
    throw new MediaStorageConfigurationError("R2 endpoint must be an HTTPS origin");
  }
  if (parsedEndpoint.pathname !== "/") {
    throw new MediaStorageConfigurationError("R2 endpoint must not include a path");
  }
  if (!config.accountId.trim() || !config.accessKeyId.trim() || !config.secretAccessKey.trim()) {
    throw new MediaStorageConfigurationError("R2 credentials are incomplete");
  }
  if (!/^[A-Za-z0-9._-]{3,63}$/.test(config.bucketName)) {
    throw new MediaStorageConfigurationError("R2 bucket name is invalid");
  }
  const signedUrlTtlSeconds = config.signedUrlTtlSeconds ?? 45;
  if (!Number.isInteger(signedUrlTtlSeconds) || signedUrlTtlSeconds < 1 || signedUrlTtlSeconds > 300) {
    throw new MediaStorageConfigurationError("R2 signed URL TTL must be between 1 and 300 seconds");
  }
  return { ...config, endpoint: parsedEndpoint.origin, signedUrlTtlSeconds };
}

export class R2MediaStorage implements MediaStorage {
  private readonly config: Required<R2MediaStorageConfig>;

  constructor(
    config: R2MediaStorageConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.config = validateConfig(config);
  }

  private objectUrl(key: string): URL {
    assertStorageKey(key);
    return new URL(
      `/${awsEncode(this.config.bucketName)}/${encodeObjectPath(key)}`,
      this.config.endpoint
    );
  }

  private authorization(input: {
    bodyHash: string;
    method: "DELETE" | "GET" | "PUT";
    url: URL;
  }): { authorization: string; timestamp: string } {
    const { date, timestamp } = amzTimestamp(this.clock());
    const headers = {
      host: input.url.host,
      "x-amz-content-sha256": input.bodyHash,
      "x-amz-date": timestamp,
    };
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${normalizeHeaderValue(value)}\n`)
      .join("");
    const request = [
      input.method,
      input.url.pathname,
      canonicalQuery(input.url.searchParams.entries()),
      canonicalHeaders,
      signedHeaders,
      input.bodyHash,
    ].join("\n");
    const scope = `${date}/auto/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256(request)].join("\n");
    const signature = createHmac("sha256", signingKey(this.config.secretAccessKey, date))
      .update(stringToSign)
      .digest("hex");
    return {
      timestamp,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  private async signedRequest(input: {
    body?: Uint8Array;
    contentDisposition?: string;
    contentType?: string;
    key: string;
    method: "DELETE" | "GET" | "PUT";
    range?: string;
  }): Promise<Response> {
    const url = this.objectUrl(input.key);
    const bodyHash = sha256(input.body ?? new Uint8Array());
    const { authorization, timestamp } = this.authorization({
      bodyHash,
      method: input.method,
      url,
    });
    const headers: Record<string, string> = {
      Authorization: authorization,
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": timestamp,
    };
    if (input.contentType) headers["Content-Type"] = input.contentType;
    if (input.contentDisposition) headers["Content-Disposition"] = input.contentDisposition;
    if (input.range) headers.Range = input.range;

    return this.fetchImplementation(url, {
      method: input.method,
      headers,
      body: input.body ? new Blob([input.body]) : undefined,
      redirect: "error",
    });
  }

  private async assertSuccess(response: Response, operation: string): Promise<void> {
    if (response.ok) return;
    const requestId = response.headers.get("cf-ray") ?? response.headers.get("x-amz-request-id");
    throw new MediaStorageError(
      `${operation} failed${requestId ? ` (request ${requestId})` : ""}`,
      response.status
    );
  }

  async putObject(input: {
    body: Uint8Array;
    contentDisposition: string;
    contentType: SupportedMediaMimeType;
    key: string;
  }): Promise<void> {
    const response = await this.signedRequest({ ...input, method: "PUT" });
    await this.assertSuccess(response, "Private media upload");
  }

  async getObject(key: string, options: { range?: string } = {}): Promise<StoredMediaObject> {
    const response = await this.signedRequest({ key, method: "GET", range: options.range });
    await this.assertSuccess(response, "Private media download");
    const contentLength = response.headers.get("Content-Length");
    return {
      acceptRanges: response.headers.get("Accept-Ranges"),
      body: response.body,
      contentLength: contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : null,
      contentRange: response.headers.get("Content-Range"),
      contentType: response.headers.get("Content-Type"),
      status: response.status,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const response = await this.signedRequest({ key, method: "DELETE" });
    // S3 DELETE is normally idempotent; tolerate a provider/gateway 404 too.
    if (response.status === 404) return;
    await this.assertSuccess(response, "Private media deletion");
  }

  async createSignedDownloadUrl(input: {
    contentDisposition: string;
    contentType: string;
    expiresInSeconds?: number;
    key: string;
  }): Promise<string> {
    const url = this.objectUrl(input.key);
    const expiresInSeconds = input.expiresInSeconds ?? this.config.signedUrlTtlSeconds;
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 300) {
      throw new MediaStorageError("Signed media URL expiry must be between 1 and 300 seconds");
    }
    const { date, timestamp } = amzTimestamp(this.clock());
    const scope = `${date}/auto/s3/aws4_request`;
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set("X-Amz-Credential", `${this.config.accessKeyId}/${scope}`);
    url.searchParams.set("X-Amz-Date", timestamp);
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    url.searchParams.set("X-Amz-SignedHeaders", "host");
    url.searchParams.set("response-content-disposition", input.contentDisposition);
    url.searchParams.set("response-content-type", input.contentType);

    const canonicalRequest = [
      "GET",
      url.pathname,
      canonicalQuery(url.searchParams.entries()),
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = createHmac("sha256", signingKey(this.config.secretAccessKey, date))
      .update(stringToSign)
      .digest("hex");
    url.searchParams.set("X-Amz-Signature", signature);
    return url.toString();
  }
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MediaStorageConfigurationError(`${name} is required`);
  return value;
}

let defaultStorage: MediaStorage | undefined;

/** Lazy construction keeps builds/tests independent from deployment secrets. */
export function getMediaStorage(): MediaStorage {
  defaultStorage ??= new R2MediaStorage({
    accountId: requiredEnvironmentVariable("R2_ACCOUNT_ID"),
    accessKeyId: requiredEnvironmentVariable("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironmentVariable("R2_SECRET_ACCESS_KEY"),
    bucketName: requiredEnvironmentVariable("R2_BUCKET_NAME"),
    endpoint: process.env.R2_ENDPOINT?.trim() || undefined,
    signedUrlTtlSeconds: process.env.R2_SIGNED_URL_TTL_SECONDS
      ? Number(process.env.R2_SIGNED_URL_TTL_SECONDS)
      : undefined,
  });
  return defaultStorage;
}
