import { parseAllDocuments } from "yaml";

export const HTTP_METHODS = [
  "get", "put", "post", "delete", "options", "head", "patch", "trace",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiOperation {
  filePath: string;
  documentTitle: string;
  serviceName?: string;
  openapiVersion: string;
  method: HttpMethod;
  path: string;
  operationId: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  controllerTemplate?: string;
  requestSchemaName?: string;
  responseSchemaNames: string[];
}

export type OpenApiSchemaKind = "request" | "response" | "schema" | "enum";

export interface OpenApiScalarProperty {
  name: string;
  type: string;
  format?: string;
  required: boolean;
  nullable: boolean;
  collection: boolean;
  collectionType?: string;
}

export interface OpenApiNavigationProperty {
  name: string;
  targetSchema: string;
  required: boolean;
  nullable: boolean;
  collection: boolean;
  collectionType?: string;
  belongsToSource?: boolean;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface OpenApiSchema {
  name: string;
  kind: OpenApiSchemaKind;
  scalarProperties: OpenApiScalarProperty[];
  navigationProperties: OpenApiNavigationProperty[];
  enumValues: Array<string | number | boolean | null>;
  enumNames: string[];
}

export interface OpenApiDiagnostic {
  filePath: string;
  level: "error" | "warning";
  message: string;
}

export interface OpenApiParseResult {
  accepted: boolean;
  openapiVersion?: string;
  operations: OpenApiOperation[];
  schemas: OpenApiSchema[];
  diagnostics: OpenApiDiagnostic[];
}

export type DiagramBounds = readonly [number, number, number, number];
export type DiagramPoint = readonly [number, number];

export interface OpenApiLayoutCompartment {
  name: string;
  bounds: DiagramBounds;
  expanded: boolean;
  textColor?: string;
  iconColor?: string;
}

export interface OpenApiLayoutNode {
  id: string;
  bounds: DiagramBounds;
  name?: string;
  type?: string;
  targetNodeId?: string;
  expanded: boolean;
  compartments: OpenApiLayoutCompartment[];
  outlineColor?: string;
  fillColor?: string;
  textColor?: string;
  outlineThickness?: number;
  outlineDashStyle?: string;
  gradient?: string;
}

export interface OpenApiLayoutEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  points: DiagramPoint[];
  associationId?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface OpenApiServiceLayout {
  version: 1;
  units: "diagram";
  serviceBounds: DiagramBounds;
  operationsBounds: DiagramBounds;
  operationsExpanded: boolean;
  nodes: Record<string, OpenApiLayoutNode>;
  edges: Record<string, OpenApiLayoutEdge>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface OpenApiLayoutParseResult {
  layout?: OpenApiServiceLayout;
  diagnostics: OpenApiDiagnostic[];
}

type UnknownRecord = Record<string, unknown>;
const OPENAPI_VERSION = /^3\.(0|1)\.\d+(?:[-+].*)?$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function localSchemaName(ref: unknown): string | undefined {
  const value = readString(ref);
  const prefix = "#/components/schemas/";
  if (!value?.startsWith(prefix)) return undefined;
  return decodeURIComponent(value.slice(prefix.length));
}

function schemaTarget(schema: UnknownRecord): string | undefined {
  const direct = localSchemaName(schema.$ref);
  if (direct) return direct;
  if (schema.type === "array" && isRecord(schema.items)) return schemaTarget(schema.items);

  for (const keyword of ["allOf", "oneOf", "anyOf"]) {
    const variants = schema[keyword];
    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      if (!isRecord(variant)) continue;
      const target = schemaTarget(variant);
      if (target) return target;
    }
  }

  return undefined;
}

function schemaRefFromContent(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const content = isRecord(value.content) ? value.content : undefined;
  if (!content) return undefined;

  for (const mediaType of Object.values(content)) {
    if (!isRecord(mediaType) || !isRecord(mediaType.schema)) continue;
    const target = schemaTarget(mediaType.schema);
    if (target) return target;
  }
  return undefined;
}

function responseSchemaNames(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const names: string[] = [];
  for (const response of Object.values(value)) {
    const name = schemaRefFromContent(response);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function propertyType(property: UnknownRecord, metadata: UnknownRecord): string {
  const customTypeName = readString(metadata.customTypeName);
  if (customTypeName) return customTypeName;

  const target = schemaTarget(property);
  if (target) return property.type === "array" ? `${target}[]` : target;

  const rawType = property.type;
  if (Array.isArray(rawType)) {
    return rawType.filter((value) => value !== "null").map(String).join(" | ") || "unknown";
  }
  if (typeof rawType === "string") {
    if (rawType === "array" && isRecord(property.items)) {
      return `${propertyType(property.items, {})}[]`;
    }
    return rawType;
  }
  return "unknown";
}

function isNullableProperty(property: UnknownRecord, metadata: UnknownRecord): boolean {
  if (property.nullable === true || metadata.nullable === true) return true;
  return Array.isArray(property.type) && property.type.includes("null");
}

function explicitSchemaKind(metadata: UnknownRecord): Exclude<OpenApiSchemaKind, "enum"> | undefined {
  switch (readString(metadata.dcKind)?.toLowerCase()) {
    case "request": return "request";
    case "response": return "response";
    case "normal":
    case "schema": return "schema";
    default: return undefined;
  }
}

function parseSchemas(
  root: UnknownRecord,
  requestSchemas: Set<string>,
  responseSchemas: Set<string>,
): OpenApiSchema[] {
  const components = isRecord(root.components) ? root.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};

  return Object.entries(schemas).flatMap(([name, value]) => {
    if (!isRecord(value)) return [];
    const metadata = isRecord(value["x-illumify-schema"]) ? value["x-illumify-schema"] : {};
    const requiredNames = new Set(
      Array.isArray(value.required)
        ? value.required.filter((entry): entry is string => typeof entry === "string")
        : [],
    );
    const enumValues = Array.isArray(value.enum)
      ? value.enum.filter((entry): entry is string | number | boolean | null =>
          entry === null || ["string", "number", "boolean"].includes(typeof entry))
      : [];
    const microsoftEnum = isRecord(value["x-ms-enum"]) ? value["x-ms-enum"] : {};
    const microsoftEnumValues = Array.isArray(microsoftEnum.values) ? microsoftEnum.values : [];
    const enumNameSource = Array.isArray(value["x-enum-varnames"])
      ? value["x-enum-varnames"]
      : Array.isArray(value["x-enumNames"])
        ? value["x-enumNames"]
        : microsoftEnumValues.flatMap((entry) => isRecord(entry) && readString(entry.name) ? [entry.name] : []);
    const enumNames = enumNameSource.filter((entry): entry is string => typeof entry === "string");
    const scalarProperties: OpenApiScalarProperty[] = [];
    const navigationProperties: OpenApiNavigationProperty[] = [];
    const properties = isRecord(value.properties) ? value.properties : {};

    for (const [propertyName, propertyValue] of Object.entries(properties)) {
      if (!isRecord(propertyValue)) continue;
      const propertyMetadata = isRecord(propertyValue["x-illumify-property"])
        ? propertyValue["x-illumify-property"]
        : {};
      const navigation = isRecord(propertyMetadata.navigation)
        ? propertyMetadata.navigation
        : undefined;
      const collection = propertyValue.type === "array";
      const common = {
        name: propertyName,
        required: requiredNames.has(propertyName),
        nullable: isNullableProperty(propertyValue, propertyMetadata),
        collection,
        collectionType: readString(propertyMetadata.collectionType),
      };

      if (navigation) {
        const target = schemaTarget(propertyValue) ?? readString(propertyMetadata.customTypeName);
        if (!target) continue;
        navigationProperties.push({
          ...common,
          targetSchema: target,
          belongsToSource: readBoolean(navigation.belongsToSource),
          sourceMultiplicity: readString(navigation.sourceMultiplicity),
          targetMultiplicity: readString(navigation.targetMultiplicity),
        });
      } else {
        scalarProperties.push({
          ...common,
          type: propertyType(propertyValue, propertyMetadata),
          format: readString(propertyValue.format),
        });
      }
    }

    const kind: OpenApiSchemaKind = enumValues.length > 0
      ? "enum"
      : explicitSchemaKind(metadata)
        ?? (requestSchemas.has(name) ? "request" : responseSchemas.has(name) ? "response" : "schema");

    return [{ name, kind, scalarProperties, navigationProperties, enumValues, enumNames }];
  });
}

export function isYamlFileName(name: string): boolean {
  return /\.ya?ml$/i.test(name);
}

export function isOpenApiFileName(name: string): boolean {
  return /\.openapi\.ya?ml$/i.test(name);
}

export function isOpenApiLayoutFileName(name: string): boolean {
  return /\.openapi\.layout\.json$/i.test(name);
}

export function layoutPathForOpenApi(filePath: string): string {
  return filePath.replace(/\.ya?ml$/i, ".layout.json");
}

function readBounds(value: unknown): DiagramBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) return undefined;
  if (value[2] <= 0 || value[3] <= 0) return undefined;
  return value as unknown as DiagramBounds;
}

function readPoint(value: unknown): DiagramPoint | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  if (!value.every((part) => typeof part === "number" && Number.isFinite(part))) return undefined;
  return value as unknown as DiagramPoint;
}

export function parseOpenApiLayout(source: string, filePath: string): OpenApiLayoutParseResult {
  let root: unknown;
  try {
    root = JSON.parse(source);
  } catch (error) {
    return {
      diagnostics: [{
        filePath,
        level: "warning",
        message: `Layout ignored: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }

  if (!isRecord(root) || root.v !== 1 || root.units !== "diagram") {
    return {
      diagnostics: [{
        filePath,
        level: "warning",
        message: "Layout ignored: expected compact layout version 1 with diagram units.",
      }],
    };
  }

  const rawNodes = isRecord(root.nodes) ? root.nodes : {};
  const nodes: Record<string, OpenApiLayoutNode> = {};
  for (const [id, value] of Object.entries(rawNodes)) {
    if (!isRecord(value)) continue;
    const bounds = readBounds(value.b);
    if (!bounds) continue;
    const metadata = isRecord(value.m) ? value.m : {};
    const compartments: OpenApiLayoutCompartment[] = Array.isArray(value.cm)
      ? value.cm.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const compartmentBounds = readBounds(entry.b);
          const name = readString(entry.n);
          if (!compartmentBounds || !name) return [];
          return [{
            name,
            bounds: compartmentBounds,
            expanded: entry.ex !== false,
            textColor: readString(entry.tc),
            iconColor: readString(entry.ic),
          }];
        })
      : [];

    nodes[id] = {
      id,
      bounds,
      name: readString(value.n),
      type: readString(value.t),
      targetNodeId: readString(metadata.d),
      expanded: value.ex !== false,
      compartments,
      outlineColor: readString(value.c),
      fillColor: readString(value.f),
      textColor: readString(value.tx),
      outlineThickness: typeof value.dt === "number" && Number.isFinite(value.dt) ? value.dt : undefined,
      outlineDashStyle: readString(value.ds),
      gradient: readString(value.g),
    };
  }

  const rawEdges = isRecord(root.edges) ? root.edges : {};
  const edges: Record<string, OpenApiLayoutEdge> = {};
  for (const [id, value] of Object.entries(rawEdges)) {
    if (!isRecord(value)) continue;
    const sourceNodeId = readString(value.s);
    const targetNodeId = readString(value.t);
    if (!sourceNodeId || !targetNodeId) continue;
    const metadata = isRecord(value.m) ? value.m : {};
    edges[id] = {
      id,
      sourceNodeId,
      targetNodeId,
      points: Array.isArray(value.p)
        ? value.p.map(readPoint).filter((point): point is DiagramPoint => point !== undefined)
        : [],
      associationId: readString(value.a),
      sourceMultiplicity: readString(metadata.sm),
      targetMultiplicity: readString(metadata.tm),
    };
  }

  const service = isRecord(rawNodes["service:main"])
    ? rawNodes["service:main"]
    : undefined;
  const serviceBounds = service ? readBounds(service.b) : undefined;
  const compartments = service && Array.isArray(service.cm) ? service.cm : [];
  const operations = compartments.find((value) => isRecord(value) && value.n === "Operations");
  const operationsBounds = isRecord(operations) ? readBounds(operations.b) : undefined;
  const rawViewport = isRecord(root.viewport) ? root.viewport : undefined;
  const viewport = rawViewport
    && typeof rawViewport.x === "number" && Number.isFinite(rawViewport.x)
    && typeof rawViewport.y === "number" && Number.isFinite(rawViewport.y)
    && typeof rawViewport.z === "number" && Number.isFinite(rawViewport.z)
    ? { x: rawViewport.x, y: rawViewport.y, zoom: rawViewport.z }
    : undefined;

  if (!serviceBounds || !operationsBounds) {
    return {
      diagnostics: [{
        filePath,
        level: "warning",
        message: "Layout ignored: service:main or its Operations compartment has invalid bounds.",
      }],
    };
  }

  return {
    layout: {
      version: 1,
      units: "diagram",
      serviceBounds,
      operationsBounds,
      operationsExpanded: !(isRecord(operations) && operations.ex === false),
      nodes,
      edges,
      viewport,
    },
    diagnostics: [],
  };
}

export function parseOpenApiOperations(source: string, filePath: string): OpenApiParseResult {
  const diagnostics: OpenApiDiagnostic[] = [];
  const reportUnidentifiedYamlErrors = isOpenApiFileName(filePath);
  let documents;

  try {
    documents = parseAllDocuments(source, { prettyErrors: true, uniqueKeys: true });
  } catch (error) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: reportUnidentifiedYamlErrors ? [{
        filePath,
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      }] : [],
    };
  }

  if (documents.length !== 1) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: reportUnidentifiedYamlErrors
        ? [{ filePath, level: "error", message: "Expected exactly one YAML document per file." }]
        : [],
    };
  }

  const document = documents[0];
  if (document.errors.length > 0) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: reportUnidentifiedYamlErrors ? document.errors.map((error) => ({
        filePath,
        level: "error" as const,
        message: error.message,
      })) : [],
    };
  }

  let root: unknown;
  try {
    root = document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: reportUnidentifiedYamlErrors ? [{
        filePath,
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      }] : [],
    };
  }
  if (!isRecord(root)) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: reportUnidentifiedYamlErrors
        ? [{ filePath, level: "error", message: "The YAML document root must be an object." }]
        : [],
    };
  }

  const version = readString(root.openapi);
  if (!version) {
    return {
      accepted: false,
      operations: [],
      schemas: [],
      diagnostics: [],
    };
  }

  if (!OPENAPI_VERSION.test(version)) {
    return {
      accepted: false,
      openapiVersion: version,
      operations: [],
      schemas: [],
      diagnostics: [{
        filePath,
        level: "error",
        message: `Unsupported OpenAPI version ${version}. Supported: 3.0.x and 3.1.x.`,
      }],
    };
  }

  const info = isRecord(root.info) ? root.info : {};
  const illumifyService = isRecord(root["x-illumify-service"])
    ? root["x-illumify-service"]
    : {};
  const documentTitle = readString(info.title) ?? readString(illumifyService.serviceName) ?? filePath;
  const serviceName = readString(illumifyService.serviceName);
  const paths = root.paths;
  const operations: OpenApiOperation[] = [];
  const requestSchemas = new Set<string>();
  const responseSchemas = new Set<string>();

  if (!isRecord(paths)) {
    diagnostics.push({ filePath, level: "warning", message: "OpenAPI document has no paths object." });
  } else {
    for (const [route, pathValue] of Object.entries(paths)) {
      if (!isRecord(pathValue)) continue;

      if (readString(pathValue.$ref)) {
        diagnostics.push({
          filePath,
          level: "warning",
          message: `Skipped unresolved Path Item $ref at ${route}.`,
        });
      }

      for (const [rawMethod, operationValue] of Object.entries(pathValue)) {
        const method = rawMethod.toLowerCase();
        if (!HTTP_METHODS.includes(method as HttpMethod)) continue;
        if (!isRecord(operationValue)) continue;
        const operationMetadata = isRecord(operationValue["x-illumify-operation"])
          ? operationValue["x-illumify-operation"]
          : {};
        const requestSchemaName = readString(operationMetadata.requestDcName)
          ?? schemaRefFromContent(operationValue.requestBody);
        const operationResponseSchemas = readString(operationMetadata.responseDcName)
          ? [readString(operationMetadata.responseDcName)!]
          : responseSchemaNames(operationValue.responses);
        if (requestSchemaName) requestSchemas.add(requestSchemaName);
        operationResponseSchemas.forEach((name) => responseSchemas.add(name));

        operations.push({
          filePath,
          documentTitle,
          serviceName,
          openapiVersion: version,
          method: method as HttpMethod,
          path: route,
          operationId: readString(operationValue.operationId) ?? `${method.toUpperCase()} ${route}`,
          summary: readString(operationValue.summary),
          description: readString(operationValue.description),
          tags: readTags(operationValue.tags),
          deprecated: operationValue.deprecated === true,
          controllerTemplate: readString(operationMetadata.controllerTemplate),
          requestSchemaName,
          responseSchemaNames: operationResponseSchemas,
        });
      }
    }
  }

  const schemas = parseSchemas(root, requestSchemas, responseSchemas);
  return { accepted: true, openapiVersion: version, operations, schemas, diagnostics };
}
