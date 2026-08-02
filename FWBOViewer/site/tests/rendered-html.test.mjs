import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete OpenAPI model viewer", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Illumify OpenAPI Model Viewer<\/title>/i);
  assert.match(html, /OpenAPI Model Viewer/);
  assert.match(html, /Choose folder \/ files/);
  assert.match(html, /OpenAPI 3\.0\.x \+ 3\.1\.x/);
  assert.match(html, /component schemas, scalar properties, navigation links, enums, aliases, and association routes/i);
  assert.doesNotMatch(html, /webkitdirectory|nothing is uploaded|will upload/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("starter preview assets are removed", async () => {
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
});
