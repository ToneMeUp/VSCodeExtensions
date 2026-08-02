import assert from "node:assert/strict";
import test from "node:test";
import {
  HTTP_METHODS,
  isOpenApiLayoutFileName,
  isYamlFileName,
  layoutPathForOpenApi,
  parseOpenApiLayout,
  parseOpenApiOperations,
} from "../lib/openapi.ts";
import {
  computeDiagramViewport,
  multiplicityLabelPosition,
  routeOrthogonal,
} from "../lib/diagram.ts";

test("accepts OpenAPI 3.0 YAML and extracts direct path operations", () => {
  const result = parseOpenApiOperations(`
openapi: 3.0.3
info:
  title: Orders API
  version: 1.0.0
paths:
  /orders:
    parameters: []
    get:
      operationId: GetOrders
      summary: List orders
      tags: [Orders]
    post:
      operationId: PersistOrder
components:
  schemas:
    Order:
      type: object
`, "root/accounting/orders.yaml");

  assert.equal(result.accepted, true);
  assert.equal(result.openapiVersion, "3.0.3");
  assert.deepEqual(result.operations.map((operation) => operation.operationId), ["GetOrders", "PersistOrder"]);
  assert.equal(result.operations[0].documentTitle, "Orders API");
  assert.equal(result.operations[0].tags[0], "Orders");
});

test("accepts OpenAPI 3.1 and extracts all supported HTTP methods", () => {
  const paths = HTTP_METHODS.map((method) => `    ${method}:\n      operationId: ${method}Thing`).join("\n");
  const result = parseOpenApiOperations(`
openapi: 3.1.0
info: { title: Full API, version: 1.0.0 }
x-illumify-service:
  serviceName: FullAccess
paths:
  /things:
${paths}
`, "root/full.yml");

  assert.equal(result.accepted, true);
  assert.equal(result.operations.length, HTTP_METHODS.length);
  assert.equal(result.operations[0].serviceName, "FullAccess");
});

test("extracts component schemas, scalar fields, navigation semantics, and request/response kinds", () => {
  const result = parseOpenApiOperations(`
openapi: 3.1.0
info: { title: Orders, version: 1.0.0 }
paths:
  /orders/persist:
    post:
      operationId: Persist
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PersistRequest' }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PersistResponse' }
components:
  schemas:
    PersistRequest:
      type: object
      required: [CompanyId]
      properties:
        CompanyId: { type: integer, format: int32 }
        Note: { type: [string, 'null'] }
        Status: { $ref: '#/components/schemas/OrderStatusEnum' }
        LineList:
          type: array
          items: { $ref: '#/components/schemas/OrderLine' }
          x-illumify-property:
            collectionType: ICollection
            navigation:
              belongsToSource: true
              sourceMultiplicity: '1'
              targetMultiplicity: '*'
    PersistResponse:
      type: object
      properties:
        ValidationResults:
          type: object
          x-illumify-property:
            typeCategory: Custom
            customTypeName: ValidationResults
    OrderLine:
      type: object
      x-illumify-schema: { dcKind: Normal }
      properties:
        Quantity: { type: number, format: decimal }
    OrderStatusEnum:
      type: integer
      enum: [0, 1]
      x-enum-varnames: [NotDefined, Active]
`, "root/OrdersAccess.openapi.yaml");

  assert.equal(result.operations[0].requestSchemaName, "PersistRequest");
  assert.deepEqual(result.operations[0].responseSchemaNames, ["PersistResponse"]);
  assert.deepEqual(result.schemas.map((schema) => [schema.name, schema.kind]), [
    ["PersistRequest", "request"],
    ["PersistResponse", "response"],
    ["OrderLine", "schema"],
    ["OrderStatusEnum", "enum"],
  ]);

  const request = result.schemas[0];
  assert.deepEqual(request.scalarProperties, [
    { name: "CompanyId", type: "integer", format: "int32", required: true, nullable: false, collection: false, collectionType: undefined },
    { name: "Note", type: "string", format: undefined, required: false, nullable: true, collection: false, collectionType: undefined },
    { name: "Status", type: "OrderStatusEnum", format: undefined, required: false, nullable: false, collection: false, collectionType: undefined },
  ]);
  assert.deepEqual(request.navigationProperties, [{
    name: "LineList",
    targetSchema: "OrderLine",
    required: false,
    nullable: false,
    collection: true,
    collectionType: "ICollection",
    belongsToSource: true,
    sourceMultiplicity: "1",
    targetMultiplicity: "*",
  }]);
  assert.equal(result.schemas[1].scalarProperties[0].type, "ValidationResults");
  assert.deepEqual(result.schemas[3].enumValues, [0, 1]);
  assert.deepEqual(result.schemas[3].enumNames, ["NotDefined", "Active"]);
});

test("ignores non-OpenAPI YAML without blocking the folder", () => {
  const result = parseOpenApiOperations("name: deployment\nreplicas: 2", "root/app.yaml");
  assert.equal(result.accepted, false);
  assert.equal(result.operations.length, 0);
  assert.deepEqual(result.diagnostics, []);
});

test("isolates malformed YAML and unsupported versions", () => {
  const malformed = parseOpenApiOperations("openapi: [", "root/bad.yaml");
  const namedMalformed = parseOpenApiOperations("openapi: [", "root/bad.openapi.yaml");
  const swagger = parseOpenApiOperations("swagger: '2.0'\ninfo: { title: Old, version: 1 }", "root/old.yml");
  const future = parseOpenApiOperations("openapi: 4.0.0\ninfo: { title: Future, version: 1 }", "root/future.yaml");
  assert.equal(malformed.accepted, false);
  assert.deepEqual(malformed.diagnostics, []);
  assert.equal(namedMalformed.diagnostics[0].level, "error");
  assert.equal(swagger.accepted, false);
  assert.deepEqual(swagger.diagnostics, []);
  assert.equal(future.accepted, false);
  assert.match(future.diagnostics[0].message, /Unsupported OpenAPI version/);
});

test("preserves operation order from the YAML paths and Path Item", () => {
  const result = parseOpenApiOperations(`
openapi: 3.1.0
info: { title: Ordered, version: 1.0.0 }
paths:
  /second:
    post: { operationId: SecondPost }
    get: { operationId: SecondGet }
  /first:
    delete: { operationId: FirstDelete }
`, "root/ordered.openapi.yaml");

  assert.deepEqual(
    result.operations.map((operation) => operation.operationId),
    ["SecondPost", "SecondGet", "FirstDelete"],
  );
});

test("reports unresolved Path Item refs and ignores path metadata", () => {
  const result = parseOpenApiOperations(`
openapi: 3.1.1
info: { title: Ref API, version: 1.0.0 }
paths:
  /external:
    $ref: ./paths.yaml#/External
  /direct:
    parameters: []
    summary: Path metadata
    get: { summary: Direct }
`, "root/ref.yaml");

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].operationId, "GET /direct");
  assert.match(result.diagnostics[0].message, /unresolved Path Item \$ref/);
});

test("matches yaml and yml extensions case-insensitively", () => {
  assert.equal(isYamlFileName("nested/API.YAML"), true);
  assert.equal(isYamlFileName("nested/api.yml"), true);
  assert.equal(isYamlFileName("api.json"), false);
});

test("pairs YAML and YML with a layout sidecar in the same directory", () => {
  assert.equal(
    layoutPathForOpenApi("root/accounting/AccountAccess.openapi.yaml"),
    "root/accounting/AccountAccess.openapi.layout.json",
  );
  assert.equal(
    layoutPathForOpenApi("root/accounting/AccountAccess.openapi.YML"),
    "root/accounting/AccountAccess.openapi.layout.json",
  );
  assert.equal(isOpenApiLayoutFileName("AccountAccess.openapi.layout.json"), true);
  assert.equal(isOpenApiLayoutFileName("unrelated.json"), false);
});

test("reads service and Operations geometry from compact OpenAPI layout v1", () => {
  const result = parseOpenApiLayout(JSON.stringify({
    v: 1,
    units: "diagram",
    nodes: {
      "service:main": {
        b: [0.5, 0.75, 2.25, 4.5],
        cm: [
          { n: "Operations", b: [0.515, 1.06, 2.22, 3.8], tc: "Black", ic: "Black" },
          { n: "WorkflowTaskProcessors", b: [0.515, 4.87, 2.22, 0.25] },
        ],
      },
      "schema:Order": {
        b: [8, 8, 2, 2], c: "Blue", f: "White", tx: "Black", dt: 1.5, ds: "Dash", g: "Vertical",
        cm: [{ n: "Properties", b: [8.1, 8.4, 1.8, 1.2], ex: false }],
      },
      "alias:one": { b: [5, 8, 1.5, 0.5], n: "Order", m: { d: "schema:Order" } },
      "invalid:no-bounds": { n: "Ignored" },
    },
    edges: {
      association: {
        s: "alias:one", t: "schema:Order", p: [[6.5, 8.25], [8, 8.25]], a: "association",
        m: { sm: "1", tm: "*" },
      },
      invalid: { p: [[0, 0]] },
    },
    viewport: { x: 1.25, y: 2.5, z: 1.75 },
  }), "root/accounting/AccountAccess.openapi.layout.json");

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.layout?.serviceBounds, [0.5, 0.75, 2.25, 4.5]);
  assert.deepEqual(result.layout?.operationsBounds, [0.515, 1.06, 2.22, 3.8]);
  assert.equal(result.layout?.operationsExpanded, true);
  assert.deepEqual(Object.keys(result.layout?.nodes ?? {}), ["service:main", "schema:Order", "alias:one"]);
  assert.deepEqual(result.layout?.nodes["schema:Order"].compartments[0], {
    name: "Properties",
    bounds: [8.1, 8.4, 1.8, 1.2],
    expanded: false,
    textColor: undefined,
    iconColor: undefined,
  });
  assert.equal(result.layout?.nodes["schema:Order"].outlineColor, "Blue");
  assert.equal(result.layout?.nodes["alias:one"].targetNodeId, "schema:Order");
  assert.deepEqual(result.layout?.edges.association, {
    id: "association",
    sourceNodeId: "alias:one",
    targetNodeId: "schema:Order",
    points: [[6.5, 8.25], [8, 8.25]],
    associationId: "association",
    sourceMultiplicity: "1",
    targetMultiplicity: "*",
  });
  assert.deepEqual(result.layout?.viewport, { x: 1.25, y: 2.5, zoom: 1.75 });
});

test("rejects invalid matched layouts and supports explicit collapsed Operations", () => {
  const invalid = parseOpenApiLayout('{"v":2}', "root/Test.openapi.layout.json");
  const collapsed = parseOpenApiLayout(JSON.stringify({
    v: 1,
    units: "diagram",
    nodes: {
      "service:main": {
        b: [0.5, 0.5, 2, 1],
        cm: [{ n: "Operations", b: [0.515, 0.81, 1.97, 0.25], ex: false }],
      },
    },
  }), "root/Test.openapi.layout.json");

  assert.equal(invalid.layout, undefined);
  assert.equal(invalid.diagnostics[0].level, "warning");
  assert.equal(collapsed.layout?.operationsExpanded, false);
});

test("diagram viewport translates negative and extreme recovered coordinates without clipping", () => {
  const viewport = computeDiagramViewport(
    [
      { x: -240, y: -96, width: 144, height: 48 },
      { x: 960, y: 480, width: 192, height: 96 },
    ],
    [[[-300, -120], [1200, 600]]],
    40,
    0,
    0,
  );

  assert.deepEqual(viewport, {
    offsetX: 340,
    offsetY: 160,
    width: 1580,
    height: 800,
  });
  assert.deepEqual([-300 + viewport.offsetX, -120 + viewport.offsetY], [40, 40]);
  assert.deepEqual([1200 + viewport.offsetX, 600 + viewport.offsetY], [1540, 760]);
});

test("fallback association routing remains orthogonal and avoids unrelated nodes", () => {
  const obstacle = { x: 230, y: 0, width: 140, height: 180 };
  const points = routeOrthogonal(
    { x: 0, y: 40, width: 100, height: 80 },
    { x: 500, y: 40, width: 100, height: 80 },
    [obstacle],
  );

  assert.ok(points.length >= 4);
  assert.ok(points.some(([, y]) => y < obstacle.y));
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    assert.ok(x1 === x2 || y1 === y2, "all connector segments must be orthogonal");
    if (y1 === y2) {
      assert.ok(y1 <= obstacle.y || y1 >= obstacle.y + obstacle.height || Math.max(x1, x2) <= obstacle.x || Math.min(x1, x2) >= obstacle.x + obstacle.width);
    } else {
      assert.ok(x1 <= obstacle.x || x1 >= obstacle.x + obstacle.width || Math.max(y1, y2) <= obstacle.y || Math.min(y1, y2) >= obstacle.y + obstacle.height);
    }
  }
});

test("multiplicity labels follow the connector direction at each endpoint", () => {
  assert.deepEqual(multiplicityLabelPosition([0, 40], [20, 40]), [12, 32]);
  assert.deepEqual(multiplicityLabelPosition([500, 40], [480, 40]), [488, 32]);
  assert.deepEqual(multiplicityLabelPosition([0, 0], [0, 20]), [8, 12]);
  assert.deepEqual(multiplicityLabelPosition([0, 0], [0, -20]), [8, -12]);
});
