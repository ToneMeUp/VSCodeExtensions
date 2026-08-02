# Illumify OpenAPI Operations Viewer

Browser-based model graph for OpenAPI YAML folders. It renders operations, schemas, properties, navigation links, aliases, and association layouts.

## Supported input

- Recursively selected `.yaml` and `.yml` files
- OpenAPI `3.0.x` and `3.1.x`
- Direct Operation Objects under `paths` for `GET`, `PUT`, `POST`, `DELETE`, `OPTIONS`, `HEAD`, `PATCH`, and `TRACE`
- Standard `operationId`, `summary`, `description`, `tags`, and `deprecated`
- Illumify `x-illumify-service.serviceName` and `x-illumify-operation.controllerTemplate`
- Optional sibling `*.openapi.layout.json` compact-v1 sidecars. The viewer uses only
  `service:main` and its `Operations` compartment geometry; schema nodes and edges stay hidden.

Schemas and model definitions under `components` are parsed by the YAML library but intentionally not displayed.

## Local setup

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server and choose an OpenAPI root folder. Browser folder selection returns nested files recursively and preserves their relative paths.

## Validation

```bash
npm run test:unit
npm run build
npm test
```

Unit coverage includes OpenAPI 3.0/3.1, both YAML extensions, all HTTP methods, malformed/unrelated YAML isolation, path metadata filtering, and unresolved Path Item references.
It also covers YAML-to-layout pairing, recovered service geometry, invalid-layout fallback,
and collapsed Operations compartments.

## Current limitations

- Swagger/OpenAPI 2.0 is rejected.
- OpenAPI 3.1 `webhooks` are not displayed.
- Path Item and external `$ref` files are not resolved.
- Multi-document YAML files are rejected.
- Missing or invalid layout sidecars fall back to a generated service diagram.
- Folder access requires an explicit user selection each browser session.
- This viewer is read-only and operations-only; it does not prove FWBO code-generation parity.

## Hosting

`.openai/hosting.json` contains the ChatGPT Sites project binding after first publication. The deployment build is Cloudflare Worker-compatible and contains no database, object storage, or runtime secrets.
