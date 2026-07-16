import assert from "node:assert/strict";
import test from "node:test";
import { browserFacingS3Config, presignObjectUrl } from "./s3Signer.js";

test("presigned URL is deterministic and path-style compatible", () => {
  const url = presignObjectUrl(
    {
      endpoint: "http://localhost:8333",
      region: "us-east-1",
      bucket: "pli-documents",
      accessKey: "pli-local-access",
      secretKey: "pli-local-secret-change-me",
      forcePathStyle: true,
    },
    {
      method: "PUT",
      objectKey: "opname/2026/07/foto bukti.jpg",
      expiresInSeconds: 900,
      now: new Date("2026-07-10T10:00:00.000Z"),
    },
  );

  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/pli-documents/opname/2026/07/foto%20bukti.jpg");
  assert.equal(parsed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "900");
  assert.match(parsed.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/);
});

test("supports virtual-host style endpoints, prefixes, GET, and RFC3986 escaping", () => {
  const url = presignObjectUrl(
    {
      endpoint: "https://objects.example.test/root/",
      region: "ap-southeast-1",
      bucket: "pli-documents",
      accessKey: "access",
      secretKey: "secret",
      forcePathStyle: false,
    },
    {
      method: "GET",
      objectKey: "avatar/a!b(c)*.webp",
      expiresInSeconds: 60,
      now: new Date("2026-07-15T00:00:00.000Z"),
    },
  );
  const parsed = new URL(url);
  assert.equal(parsed.host, "pli-documents.objects.example.test");
  assert.equal(parsed.pathname, "/root/avatar/a%21b%28c%29%2A.webp");
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "60");
});

test("replaces a loopback S3 hostname for a browser connected over LAN", () => {
  const config = browserFacingS3Config(
    {
      endpoint: "http://localhost:8333",
      region: "us-east-1",
      bucket: "pli-documents",
      accessKey: "access",
      secretKey: "secret",
      forcePathStyle: true,
    },
    "http://192.168.1.20:5173",
  );
  assert.equal(config.endpoint, "http://192.168.1.20:8333");
});

test("signs bucket listing queries and object deletion", () => {
  const config = {
    endpoint: "http://object-storage:8333",
    region: "us-east-1",
    bucket: "pli-documents",
    accessKey: "access",
    secretKey: "secret",
    forcePathStyle: true,
  };
  const listUrl = new URL(
    presignObjectUrl(config, {
      method: "GET",
      objectKey: "",
      query: { "list-type": "2", prefix: "avatar/user-1/" },
      expiresInSeconds: 60,
      now: new Date("2026-07-15T00:00:00.000Z"),
    }),
  );
  assert.equal(listUrl.pathname, "/pli-documents");
  assert.equal(listUrl.searchParams.get("list-type"), "2");
  assert.equal(listUrl.searchParams.get("prefix"), "avatar/user-1/");
  assert.match(listUrl.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/);

  const deleteUrl = new URL(
    presignObjectUrl(config, {
      method: "DELETE",
      objectKey: "avatar/user-1/photo.webp",
      expiresInSeconds: 60,
      now: new Date("2026-07-15T00:00:00.000Z"),
    }),
  );
  assert.equal(deleteUrl.pathname, "/pli-documents/avatar/user-1/photo.webp");
  assert.notEqual(
    deleteUrl.searchParams.get("X-Amz-Signature"),
    listUrl.searchParams.get("X-Amz-Signature"),
  );
});
