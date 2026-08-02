export type Point = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramViewport {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function computeDiagramViewport(
  rects: Rect[],
  polylines: Point[][],
  padding = 40,
  minimumWidth = 900,
  minimumHeight = 520,
): DiagramViewport {
  const xs = rects.flatMap((rect) => [rect.x, rect.x + rect.width]);
  const ys = rects.flatMap((rect) => [rect.y, rect.y + rect.height]);
  for (const points of polylines) for (const [x, y] of points) {
    xs.push(x);
    ys.push(y);
  }

  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...xs) : minimumWidth - padding * 2;
  const maxY = ys.length ? Math.max(...ys) : minimumHeight - padding * 2;
  return {
    offsetX: padding - minX,
    offsetY: padding - minY,
    width: Math.max(minimumWidth, maxX - minX + padding * 2),
    height: Math.max(minimumHeight, maxY - minY + padding * 2),
  };
}

function normalizePath(points: Point[]): Point[] {
  const deduped = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
  const result: Point[] = [];
  for (const point of deduped) {
    while (result.length >= 2) {
      const a = result[result.length - 2];
      const b = result[result.length - 1];
      if ((a[0] === b[0] && b[0] === point[0]) || (a[1] === b[1] && b[1] === point[1])) result.pop();
      else break;
    }
    result.push(point);
  }
  return result;
}

function segmentHitsRect(start: Point, end: Point, rect: Rect, clearance = 5): boolean {
  const left = rect.x - clearance;
  const right = rect.x + rect.width + clearance;
  const top = rect.y - clearance;
  const bottom = rect.y + rect.height + clearance;
  if (start[1] === end[1]) {
    return start[1] > top && start[1] < bottom
      && Math.max(Math.min(start[0], end[0]), left) < Math.min(Math.max(start[0], end[0]), right);
  }
  if (start[0] === end[0]) {
    return start[0] > left && start[0] < right
      && Math.max(Math.min(start[1], end[1]), top) < Math.min(Math.max(start[1], end[1]), bottom);
  }
  return true;
}

function pathScore(points: Point[], obstacles: Rect[]): number {
  let length = 0;
  let collisions = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    length += Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]);
    collisions += obstacles.filter((rect) => segmentHitsRect(start, end, rect)).length;
  }
  return collisions * 1_000_000 + length + Math.max(0, points.length - 2) * 8;
}

function ports(rect: Rect): Point[] {
  return [
    [rect.x, rect.y + rect.height / 2],
    [rect.x + rect.width, rect.y + rect.height / 2],
    [rect.x + rect.width / 2, rect.y],
    [rect.x + rect.width / 2, rect.y + rect.height],
  ];
}

export function routeOrthogonal(source: Rect, target: Rect, obstacles: Rect[]): Point[] {
  const clearance = 18;
  const laneXs = [
    (source.x + source.width / 2 + target.x + target.width / 2) / 2,
    ...obstacles.flatMap((rect) => [rect.x - clearance, rect.x + rect.width + clearance]),
  ];
  const laneYs = [
    (source.y + source.height / 2 + target.y + target.height / 2) / 2,
    ...obstacles.flatMap((rect) => [rect.y - clearance, rect.y + rect.height + clearance]),
  ];
  let best: { points: Point[]; score: number } | undefined;

  for (const start of ports(source)) for (const end of ports(target)) {
    const candidates: Point[][] = [
      [start, [end[0], start[1]], end],
      [start, [start[0], end[1]], end],
      ...laneXs.map((x): Point[] => [start, [x, start[1]], [x, end[1]], end]),
      ...laneYs.map((y): Point[] => [start, [start[0], y], [end[0], y], end]),
    ];
    for (const candidate of candidates) {
      const points = normalizePath(candidate);
      const score = pathScore(points, obstacles);
      if (!best || score < best.score) best = { points, score };
    }
  }

  return best?.points ?? [];
}

export function multiplicityLabelPosition(endpoint: Point, adjacent: Point): Point {
  const dx = adjacent[0] - endpoint[0];
  const dy = adjacent[1] - endpoint[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx === 0 ? 1 : Math.sign(dx);
    return [endpoint[0] + direction * 12, endpoint[1] - 8];
  }
  const direction = dy === 0 ? 1 : Math.sign(dy);
  return [endpoint[0] + 8, endpoint[1] + direction * 12];
}
