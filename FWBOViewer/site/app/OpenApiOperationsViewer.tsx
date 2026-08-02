"use client";

import { ChangeEvent, CSSProperties, DragEvent, useMemo, useRef, useState } from "react";
import {
  HTTP_METHODS,
  HttpMethod,
  isOpenApiLayoutFileName,
  isYamlFileName,
  layoutPathForOpenApi,
  OpenApiDiagnostic,
  OpenApiLayoutEdge,
  OpenApiLayoutNode,
  OpenApiOperation,
  OpenApiSchema,
  OpenApiServiceLayout,
  parseOpenApiLayout,
  parseOpenApiOperations,
} from "@/lib/openapi";
import { computeDiagramViewport, multiplicityLabelPosition, routeOrthogonal } from "@/lib/diagram";

interface ScanSummary { scannedFiles: number; yamlFiles: number; acceptedFiles: number }
interface LocalFile { file: File; path: string }
interface DragFileEntry { isFile: true; isDirectory: false; name: string; file(callback: (file: File) => void, error?: (error: DOMException) => void): void }
interface DragDirectoryReader { readEntries(callback: (entries: DragEntry[]) => void, error?: (error: DOMException) => void): void }
interface DragDirectoryEntry { isFile: false; isDirectory: true; name: string; createReader(): DragDirectoryReader }
type DragEntry = DragFileEntry | DragDirectoryEntry;
interface DirectoryDataTransferItem extends DataTransferItem { webkitGetAsEntry?: () => DragEntry | null }
interface ModelView {
  filePath: string;
  title: string;
  serviceName: string;
  openapiVersion: string;
  operations: OpenApiOperation[];
  schemas: OpenApiSchema[];
}

type ModelLayoutState =
  | { kind: "recovered"; layout: OpenApiServiceLayout }
  | { kind: "missing" }
  | { kind: "invalid" };

const METHOD_LABELS: Record<HttpMethod, string> = {
  get: "GET", put: "PUT", post: "POST", delete: "DELETE",
  options: "OPTIONS", head: "HEAD", patch: "PATCH", trace: "TRACE",
};
const EMPTY_SUMMARY: ScanSummary = { scannedFiles: 0, yamlFiles: 0, acceptedFiles: 0 };
const pathKey = (path: string) => path.toLocaleLowerCase();
const droppedPath = (file: File) => (file.webkitRelativePath || file.name).replaceAll("\\", "/");
const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function readDragDirectory(reader: DragDirectoryReader): Promise<DragEntry[]> {
  const result: DragEntry[] = [];
  while (true) {
    const batch = await new Promise<DragEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return result;
    result.push(...batch);
  }
}

async function collectDragEntry(entry: DragEntry, prefix = entry.name): Promise<LocalFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ file, path: prefix }];
  }
  const children = await readDragDirectory(entry.createReader());
  return (await Promise.all(children.map((child) => collectDragEntry(child, `${prefix}/${child.name}`)))).flat();
}

export function OpenApiOperationsViewer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelView[]>([]);
  const [diagnostics, setDiagnostics] = useState<OpenApiDiagnostic[]>([]);
  const [modelLayouts, setModelLayouts] = useState<Map<string, ModelLayoutState>>(new Map());
  const [summary, setSummary] = useState<ScanSummary>(EMPTY_SUMMARY);
  const [rootName, setRootName] = useState<string>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<"all" | HttpMethod>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading contracts…");
  const [isDragging, setIsDragging] = useState(false);

  const operations = useMemo(() => models.flatMap((model) => model.operations), [models]);
  const schemaCount = useMemo(() => models.reduce((sum, model) => sum + model.schemas.length, 0), [models]);
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      const methodMatch = method === "all" || model.operations.some((operation) => operation.method === method);
      if (!methodMatch) return false;
      if (!needle) return true;
      const operationMatch = model.operations.some((operation) => [
        operation.operationId, operation.path, operation.summary, operation.description, ...operation.tags,
      ].some((value) => value?.toLowerCase().includes(needle)));
      const schemaMatch = model.schemas.some((schema) =>
        schema.name.toLowerCase().includes(needle) ||
        schema.scalarProperties.some((property) => `${property.name} ${property.type}`.toLowerCase().includes(needle)) ||
        schema.navigationProperties.some((property) => `${property.name} ${property.targetSchema}`.toLowerCase().includes(needle)));
      return operationMatch || schemaMatch || model.filePath.toLowerCase().includes(needle);
    });
  }, [method, models, query]);
  const activeModel = filteredModels.find((model) => model.filePath === selectedPath) ?? filteredModels[0];

  async function loadFiles(files: LocalFile[], selectedRoot?: string) {
    setIsLoading(true);
    setLoadingMessage(`Reading ${files.length.toLocaleString()} files…`);
    await yieldToPaint();
    try {
      const yamlFiles = files.filter(({ file }) => isYamlFileName(file.name));
      const layoutFiles = new Map(files
        .filter(({ file }) => isOpenApiLayoutFileName(file.name))
        .map((entry) => [pathKey(entry.path), entry]));
      const parsedFiles = await Promise.all(yamlFiles.map(async ({ file, path: filePath }) => {
        try {
          return { filePath, result: parseOpenApiOperations(await file.text(), filePath) };
        } catch (error) {
          return { filePath, result: {
            accepted: false, operations: [], schemas: [],
            diagnostics: [{ filePath, level: "error" as const, message: error instanceof Error ? error.message : String(error) }],
          } };
        }
      }));

      const accepted = parsedFiles.filter(({ result }) => result.accepted);
      setLoadingMessage(`Recovering layouts for ${accepted.length.toLocaleString()} models…`);
      await yieldToPaint();
      const nextLayouts = new Map<string, ModelLayoutState>();
      const layoutDiagnostics: OpenApiDiagnostic[] = [];
      await Promise.all(accepted.map(async ({ filePath }) => {
        const layoutFile = layoutFiles.get(pathKey(layoutPathForOpenApi(filePath)));
        if (!layoutFile) { nextLayouts.set(filePath, { kind: "missing" }); return; }
        const parsedLayout = parseOpenApiLayout(await layoutFile.file.text(), layoutFile.path);
        layoutDiagnostics.push(...parsedLayout.diagnostics);
        nextLayouts.set(filePath, parsedLayout.layout ? { kind: "recovered", layout: parsedLayout.layout } : { kind: "invalid" });
      }));
      setLoadingMessage("Building contract diagrams…");
      await yieldToPaint();
      const nextModels = accepted.map(({ filePath, result }) => {
        const first = result.operations[0];
        const fileName = filePath.split("/").at(-1)?.replace(/\.openapi\.ya?ml$/i, "") ?? filePath;
        return {
          filePath,
          title: first?.documentTitle ?? fileName,
          serviceName: first?.serviceName ?? fileName,
          openapiVersion: result.openapiVersion ?? "",
          operations: result.operations,
          schemas: result.schemas,
        } satisfies ModelView;
      }).sort((left, right) => left.filePath.localeCompare(right.filePath));

      setRootName(selectedRoot ?? files[0]?.path.split("/")[0]);
      setModels(nextModels);
      setSelectedPath(nextModels[0]?.filePath);
      setDiagnostics([...parsedFiles.flatMap(({ result }) => result.diagnostics), ...layoutDiagnostics]);
      setModelLayouts(nextLayouts);
      setSummary({ scannedFiles: files.length, yamlFiles: yamlFiles.length, acceptedFiles: accepted.length });
      setQuery("");
      setMethod("all");
    } finally { setIsLoading(false); }
  }

  function chooseDirectory() {
    inputRef.current?.click();
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map((file) => ({ file, path: droppedPath(file) }));
    const selectedRoot = files[0]?.path.includes("/") ? files[0].path.split("/")[0] : "Selected files";
    if (files.length > 0) void loadFiles(files, selectedRoot);
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    setIsLoading(true);
    setLoadingMessage("Scanning dropped folders…");
    await yieldToPaint();
    try {
      const entries = Array.from(event.dataTransfer.items)
        .map((item) => (item as DirectoryDataTransferItem).webkitGetAsEntry?.())
        .filter((entry): entry is DragEntry => entry !== null && entry !== undefined);
      const files = entries.length > 0
        ? (await Promise.all(entries.map((entry) => collectDragEntry(entry)))).flat()
        : Array.from(event.dataTransfer.files).map((file) => ({ file, path: droppedPath(file) }));
      if (files.length > 0) await loadFiles(files);
    } catch (error) {
      setDiagnostics([{ filePath: "Drop", level: "error", message: error instanceof Error ? error.message : String(error) }]);
    } finally { setIsLoading(false); }
  }

  const hasScan = summary.scannedFiles > 0;
  return (
    <main className={`app-shell ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
      onDrop={(event) => void handleDrop(event)}>
      <input ref={(node) => { inputRef.current = node; node?.setAttribute("webkitdirectory", ""); node?.setAttribute("directory", ""); }} className="visually-hidden" type="file" accept=".yaml,.yml,.json,application/yaml,text/yaml,application/json" multiple onChange={handleFileSelection} aria-label="Select an OpenAPI root folder" />
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">IO</span><div><p className="eyebrow">Illumify developer tools</p><h1>OpenAPI Model Viewer</h1></div></div>
        <div className="header-actions"><span className="support-badge">OpenAPI 3.0.x + 3.1.x</span><button className="primary-button" type="button" onClick={chooseDirectory} disabled={isLoading}>{isLoading ? "Scanning…" : hasScan ? "Choose another folder" : "Choose folder"}</button></div>
      </header>

      {!hasScan ? (
        <section className="empty-workspace" aria-labelledby="empty-title">
          <div className="empty-panel"><p className="section-kicker">Complete model graph</p><h2 id="empty-title">Open the full API model in one pass.</h2><p className="empty-copy">Drop an OpenAPI root folder here for a recursive scan. Operations, component schemas, scalar properties, navigation links, enums, aliases, and association routes are rendered from YAML and matching layout sidecars.</p><button className="primary-button hero-button" type="button" onClick={chooseDirectory}>Select folder</button></div>
          <div className="preview-stack" aria-hidden="true"><PreviewCard className="preview-card-primary" method="get" operation="GetInventoryAvailability" path="/inventory/availability" /><PreviewCard className="preview-card-secondary" method="post" operation="PersistSalesOrder" path="/sales-orders/persist" /><PreviewCard className="preview-card-tertiary" method="patch" operation="UpdateShoppingCart" path="/shopping-cart" /></div>
        </section>
      ) : <>
        <section className="summary-strip" aria-label="Folder scan summary"><Summary label="Root" value={rootName ?? "Selected files"} /><Summary label="Files scanned" value={summary.scannedFiles} /><Summary label="OpenAPI files" value={summary.acceptedFiles} /><Summary label="Operations" value={operations.length} /><Summary label="Schemas" value={schemaCount} /><Summary label="Diagnostics" value={diagnostics.length} /></section>
        <section className="workspace">
          <aside className="filters-panel">
            <label className="search-label" htmlFor="model-search">Search model</label><input id="model-search" className="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Operation, schema, property…" />
            <div className="filter-group"><p>HTTP method</p><FilterButton active={method === "all"} label="All methods" count={operations.length} onClick={() => setMethod("all")} />{HTTP_METHODS.map((candidate) => { const count = operations.filter((operation) => operation.method === candidate).length; return count ? <FilterButton key={candidate} active={method === candidate} label={METHOD_LABELS[candidate]} count={count} onClick={() => setMethod(candidate)} /> : null; })}</div>
            <div className="model-list"><p>Models</p>{filteredModels.map((model) => <button type="button" key={model.filePath} className={activeModel?.filePath === model.filePath ? "model-button active" : "model-button"} onClick={() => setSelectedPath(model.filePath)}><span>{model.serviceName}</span><small>{model.schemas.length} schemas</small></button>)}</div>
          </aside>
          <div className="results-panel">
            {activeModel ? <section className="file-group model-file-group">
              <div className="file-heading"><div><h3>{activeModel.title}</h3><code>{activeModel.filePath}</code></div><div className="file-meta"><span>OpenAPI {activeModel.openapiVersion}</span><span>{activeModel.operations.length} operations</span><span>{activeModel.schemas.length} schemas</span><LayoutBadge state={modelLayouts.get(activeModel.filePath)} /></div></div>
              <ModelDiagram model={activeModel} state={modelLayouts.get(activeModel.filePath)} />
            </section> : <div className="no-results"><h3>No matching models</h3><p>Clear the search or choose another method.</p></div>}
            {diagnostics.length > 0 && <details className="diagnostics-panel"><summary>{diagnostics.length} file diagnostics</summary><ul>{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.filePath}:${index}`}><strong>{diagnostic.filePath}</strong><span>{diagnostic.message}</span></li>)}</ul></details>}
          </div>
        </section>
      </>}
      {isDragging && <div className="drop-overlay" aria-hidden="true">Drop OpenAPI YAML and layout files</div>}
      {isLoading && <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true"><div className="loading-card"><span className="loading-spinner" aria-hidden="true" /><strong>{loadingMessage}</strong><small>Large model folders can take a moment.</small></div></div>}
    </main>
  );
}

function LayoutBadge({ state }: { state?: ModelLayoutState }) {
  if (state?.kind === "recovered") {
    const schemaNodes = Object.keys(state.layout.nodes).filter((id) => id.startsWith("schema:")).length;
    return <span className={schemaNodes ? "layout-badge recovered" : "layout-badge fallback"}>{schemaNodes ? "Recovered full layout" : "Partial layout · schemas auto placed"}</span>;
  }
  if (state?.kind === "invalid") return <span className="layout-badge fallback">Auto layout · invalid sidecar</span>;
  return <span className="layout-badge fallback">Auto layout · sidecar missing</span>;
}

interface PlacedCompartment { name: string; x: number; y: number; width: number; height: number; expanded: boolean }
interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  schema?: OpenApiSchema;
  aliasName?: string;
  recovered: boolean;
  compartments: PlacedCompartment[];
}
interface RenderEdge extends OpenApiLayoutEdge { points: Array<readonly [number, number]> }

function placedFromLayout(node: OpenApiLayoutNode, scale: number): Pick<PlacedNode, "x" | "y" | "width" | "height" | "recovered" | "compartments"> {
  const x = node.bounds[0] * scale;
  const y = node.bounds[1] * scale;
  return {
    x,
    y,
    width: node.bounds[2] * scale,
    height: node.bounds[3] * scale,
    recovered: true,
    compartments: node.compartments.map((compartment) => ({
      name: compartment.name,
      x: compartment.bounds[0] * scale - x,
      y: compartment.bounds[1] * scale - y,
      width: compartment.bounds[2] * scale,
      height: compartment.bounds[3] * scale,
      expanded: compartment.expanded,
    })),
  };
}

function associationPair(sourceNodeId: string, targetNodeId: string): string {
  return [sourceNodeId, targetNodeId].sort().join("|");
}

function ModelDiagram({ model, state }: { model: ModelView; state?: ModelLayoutState }) {
  const scale = 96;
  const layout = state?.kind === "recovered" ? state.layout : undefined;
  const placed = new Map<string, PlacedNode>();
  const serviceLayout = layout?.nodes["service:main"];
  const servicePlaced = serviceLayout
    ? placedFromLayout(serviceLayout, scale)
    : { x: 48, y: 48, width: 260, height: Math.min(620, Math.max(150, 49 + model.operations.length * 20)), recovered: false, compartments: [] };
  placed.set("service:main", { id: "service:main", ...servicePlaced });

  const autoSchemas = model.schemas.filter((schema) => !layout?.nodes[`schema:${schema.name}`]);
  for (const schema of model.schemas) {
    const node = layout?.nodes[`schema:${schema.name}`];
    if (!node) continue;
    placed.set(node.id, { id: node.id, ...placedFromLayout(node, scale), schema });
  }
  const columns = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(autoSchemas.length))));
  const autoStartX = Math.max(360, servicePlaced.x + servicePlaced.width + 100);
  const rowHeights: number[] = [];
  autoSchemas.forEach((schema, index) => {
    const row = Math.floor(index / columns);
    const height = Math.min(420, Math.max(150, 62 + (schema.scalarProperties.length + schema.navigationProperties.length + schema.enumValues.length) * 21));
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, height);
  });
  const rowTops = rowHeights.map((_, row) => 48 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + 54, 0));
  autoSchemas.forEach((schema, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    placed.set(`schema:${schema.name}`, { id: `schema:${schema.name}`, x: autoStartX + column * 300, y: rowTops[row], width: 260, height: rowHeights[row], schema, recovered: false, compartments: [] });
  });

  if (layout) for (const node of Object.values(layout.nodes)) {
    if (placed.has(node.id) || !node.id.startsWith("alias:")) continue;
    placed.set(node.id, { id: node.id, ...placedFromLayout(node, scale), aliasName: node.name ?? node.targetNodeId?.replace("schema:", "") ?? "Alias" });
  }

  const renderEdges: RenderEdge[] = [];
  const resolveAlias = (id: string) => layout?.nodes[id]?.targetNodeId ?? id;
  if (layout) for (const edge of Object.values(layout.edges)) {
    if (!placed.has(edge.sourceNodeId) || !placed.has(edge.targetNodeId)) continue;
    const source = placed.get(edge.sourceNodeId)!;
    const target = placed.get(edge.targetNodeId)!;
    const obstacles = [...placed.values()].filter((node) => node.id !== source.id && node.id !== target.id);
    const storedPoints = edge.points.map(([x, y]) => [x * scale, y * scale] as const);
    renderEdges.push({
      ...edge,
      points: storedPoints.length >= 2 ? storedPoints : routeOrthogonal(source, target, obstacles),
    });
  }
  const laidOutAssociations = new Set(renderEdges.map((edge) => associationPair(resolveAlias(edge.sourceNodeId), resolveAlias(edge.targetNodeId))));
  for (const schema of model.schemas) for (const navigation of schema.navigationProperties) {
    const sourceNodeId = `schema:${schema.name}`;
    const targetNodeId = `schema:${navigation.targetSchema}`;
    const associationId = `assoc:${sourceNodeId}->${targetNodeId}:${navigation.name}`;
    if (!placed.has(sourceNodeId) || !placed.has(targetNodeId) || laidOutAssociations.has(associationPair(sourceNodeId, targetNodeId))) continue;
    const source = placed.get(sourceNodeId)!;
    const target = placed.get(targetNodeId)!;
    const obstacles = [...placed.values()].filter((node) => node.id !== sourceNodeId && node.id !== targetNodeId);
    renderEdges.push({ id: associationId, associationId, sourceNodeId, targetNodeId, sourceMultiplicity: navigation.sourceMultiplicity ?? "1", targetMultiplicity: navigation.targetMultiplicity ?? (navigation.collection ? "*" : navigation.nullable ? "0..1" : "1"), points: routeOrthogonal(source, target, obstacles) });
  }

  const allNodes = [...placed.values()];
  const viewport = computeDiagramViewport(allNodes, renderEdges.map((edge) => edge.points));
  const translatedEdges = renderEdges.map((edge) => ({ ...edge, points: edge.points.map(([x, y]) => [x + viewport.offsetX, y + viewport.offsetY] as const) }));
  return <div className="diagram-scroll-region full-model-scroll"><div className="operations-diagram full-model-diagram" style={{ width: viewport.width, height: viewport.height }} data-coordinate-origin={`${viewport.offsetX},${viewport.offsetY}`}>
    <svg className="graph-connectors" width={viewport.width} height={viewport.height} viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">{translatedEdges.map((edge) => {
      const sourceLabel = edge.points.length >= 2 ? multiplicityLabelPosition(edge.points[0], edge.points[1]) : undefined;
      const targetLabel = edge.points.length >= 2 ? multiplicityLabelPosition(edge.points.at(-1)!, edge.points.at(-2)!) : undefined;
      return <g key={edge.id}><polyline points={edge.points.map(([x, y]) => `${x},${y}`).join(" ")} />{edge.sourceMultiplicity && sourceLabel && <text x={sourceLabel[0]} y={sourceLabel[1]}>{edge.sourceMultiplicity}</text>}{edge.targetMultiplicity && targetLabel && <text x={targetLabel[0]} y={targetLabel[1]}>{edge.targetMultiplicity}</text>}</g>;
    })}</svg>
    {[...placed.values()].map((node) => {
      const translated = { ...node, x: node.x + viewport.offsetX, y: node.y + viewport.offsetY };
      return node.id === "service:main" ? <ServiceNode key={node.id} node={translated} model={model} /> : node.schema ? <SchemaNode key={node.id} node={translated} schema={node.schema} /> : <article key={node.id} className={`model-node alias-model-node ${node.recovered ? "recovered-node" : ""}`} style={{ left: translated.x, top: translated.y, width: node.width, height: node.height }}><header>{node.aliasName}</header><div className="alias-label">Alias</div></article>;
    })}
  </div></div>;
}

function ServiceNode({ node, model }: { node: PlacedNode; model: ModelView }) {
  const compartment = node.compartments.find((entry) => entry.name === "Operations");
  const sectionStyle = recoveredCompartmentStyle(compartment, model.operations.length);
  return <article className={`model-node service-model-node ${node.recovered ? "recovered-node" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}><header>{model.serviceName}</header><section className={`model-section ${compartment ? "recovered-compartment" : ""}`} style={sectionStyle}><h4>Operations</h4>{compartment?.expanded === false ? null : model.operations.map((operation, index) => <div className="model-row" key={`${operation.method}:${operation.path}:${index}`} title={`${METHOD_LABELS[operation.method]} ${operation.path}`}>{!node.recovered && <span className={`diagram-method method-${operation.method}`}>{METHOD_LABELS[operation.method]}</span>}<strong>{operation.operationId}</strong></div>)}</section></article>;
}

function SchemaNode({ node, schema }: { node: PlacedNode; schema: OpenApiSchema }) {
  const properties = node.compartments.find((entry) => entry.name === "Properties");
  const enums = node.compartments.find((entry) => entry.name === "EnumMembers");
  const navigations = node.compartments.find((entry) => entry.name === "NavigationProperties");
  return <article className={`model-node schema-model-node kind-${schema.kind} ${node.recovered ? "recovered-node" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}><header><span>{schema.name}</span>{!node.recovered && <small>{schema.kind}</small>}</header><div className={node.recovered ? "model-node-body recovered-node-body" : "model-node-body"}>
    {schema.scalarProperties.length > 0 && <section className={`model-section ${properties ? "recovered-compartment" : ""}`} style={recoveredCompartmentStyle(properties, schema.scalarProperties.length)}><h4>Properties</h4>{properties?.expanded === false ? null : schema.scalarProperties.map((property) => <div className="model-row property-row" key={property.name}><strong>{property.name}{property.required ? " *" : ""}</strong><span>{property.collection && !property.type.endsWith("[]") ? `${property.type}[]` : property.type}{property.format ? ` · ${property.format}` : ""}</span></div>)}</section>}
    {schema.enumValues.length > 0 && <section className={`model-section ${enums ? "recovered-compartment" : ""}`} style={recoveredCompartmentStyle(enums, schema.enumValues.length)}><h4>Members</h4>{enums?.expanded === false ? null : schema.enumValues.map((value, index) => <div className="model-row property-row" key={`${String(value)}:${index}`}><strong>{schema.enumNames[index] ?? String(value)}</strong><span>{String(value)}</span></div>)}</section>}
    {schema.navigationProperties.length > 0 && <section className={`model-section navigation-model-section ${navigations ? "recovered-compartment" : ""}`} style={recoveredCompartmentStyle(navigations, schema.navigationProperties.length)}><h4>Navigation properties</h4>{navigations?.expanded === false ? null : schema.navigationProperties.map((property) => <div className="model-row property-row navigation-row" key={property.name}><strong>{property.name}</strong><span>{property.targetSchema}{property.collection ? "[]" : ""} · {property.targetMultiplicity ?? "1"}</span></div>)}</section>}
  </div></article>;
}

function recoveredCompartmentStyle(compartment: PlacedCompartment | undefined, rowCount: number): CSSProperties | undefined {
  if (!compartment) return undefined;
  const headingHeight = 17;
  const rowHeight = Math.min(20, Math.max(6, (compartment.height - headingHeight) / Math.max(1, rowCount)));
  const rowFontSize = Math.min(9, Math.max(6, rowHeight * 0.48));
  return {
    left: compartment.x,
    top: compartment.y,
    width: compartment.width,
    height: compartment.height,
    "--recovered-row-height": `${rowHeight}px`,
    "--recovered-row-font-size": `${rowFontSize}px`,
  } as CSSProperties;
}

function PreviewCard({ className, method, operation, path }: { className: string; method: HttpMethod; operation: string; path: string }) { return <div className={`preview-card ${className}`}><span className={`method-pill method-${method}`}>{METHOD_LABELS[method]}</span><strong>{operation}</strong><code>{path}</code></div>; }
function Summary({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) { return <button type="button" className={active ? "filter-button active" : "filter-button"} onClick={onClick}><span>{label}</span><span>{count}</span></button>; }
