export interface DiagramShapeLayoutChange {
    shapeId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DiagramLayoutApplyResult {
    updatedText: string;
    appliedShapeIds: string[];
    missingShapeIds: string[];
}

interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

interface TextRange {
    start: number;
    end: number;
}

interface TextReplacement {
    start: number;
    end: number;
    value: string;
}

interface ShapeRecord {
    blockStart: number;
    blockEnd: number;
    absoluteBoundsValueRange: TextRange;
    originalBounds: Bounds;
}

interface ConnectorRecord {
    blockStart: number;
    blockEnd: number;
    edgePointsValueRange: TextRange;
    originalPoints: Point[];
    sourceShapeId?: string;
    targetShapeId?: string;
}

const EDITABLE_SHAPE_TAGS = ['entityShape', 'entityDcShape', 'serviceShape', 'dcAliasShape'] as const;
const BOUNDS_EPSILON = 0.0000001;

export class DiagramLayoutPersistence {
    public static applyLayoutChanges(
        diagramXml: string,
        changes: DiagramShapeLayoutChange[]
    ): DiagramLayoutApplyResult {
        if (!changes.length) {
            return {
                updatedText: diagramXml,
                appliedShapeIds: [],
                missingShapeIds: []
            };
        }

        const shapeRecords = this.collectShapeRecords(diagramXml);
        const latestByShapeId = new Map<string, DiagramShapeLayoutChange>();

        for (const change of changes) {
            latestByShapeId.set(change.shapeId, change);
        }

        const replacements: TextReplacement[] = [];
        const appliedShapeIds: string[] = [];
        const missingShapeIds: string[] = [];
        const newBoundsByShapeId = new Map<string, Bounds>();

        for (const [shapeId, change] of latestByShapeId) {
            const shapeRecord = shapeRecords.get(shapeId);
            if (!shapeRecord) {
                missingShapeIds.push(shapeId);
                continue;
            }

            const newRootBounds: Bounds = {
                x: change.x,
                y: change.y,
                width: change.width,
                height: change.height
            };
            newBoundsByShapeId.set(shapeId, newRootBounds);

            const rootNeedsUpdate = !this.boundsAreEqual(shapeRecord.originalBounds, newRootBounds);

            if (rootNeedsUpdate) {
                replacements.push({
                    start: shapeRecord.absoluteBoundsValueRange.start,
                    end: shapeRecord.absoluteBoundsValueRange.end,
                    value: this.formatBounds(newRootBounds)
                });
            }

            const scaleX = Math.abs(shapeRecord.originalBounds.width) < BOUNDS_EPSILON
                ? 1
                : newRootBounds.width / shapeRecord.originalBounds.width;
            const scaleY = Math.abs(shapeRecord.originalBounds.height) < BOUNDS_EPSILON
                ? 1
                : newRootBounds.height / shapeRecord.originalBounds.height;

            const blockXml = diagramXml.slice(shapeRecord.blockStart, shapeRecord.blockEnd);
            const absoluteBoundsRegex = /absoluteBounds\s*=\s*"([^"]*)"/g;
            let match: RegExpExecArray | null;

            while ((match = absoluteBoundsRegex.exec(blockXml)) !== null) {
                const fullMatchStart = shapeRecord.blockStart + match.index;
                const valueOffsetInMatch = match[0].indexOf('"') + 1;
                const valueStart = fullMatchStart + valueOffsetInMatch;
                const valueEnd = valueStart + match[1].length;

                const isRootAbsoluteBounds =
                    valueStart === shapeRecord.absoluteBoundsValueRange.start &&
                    valueEnd === shapeRecord.absoluteBoundsValueRange.end;

                if (isRootAbsoluteBounds) {
                    continue;
                }

                const childBounds = this.parseBounds(match[1]);
                if (!childBounds) {
                    continue;
                }

                const transformedChildBounds: Bounds = {
                    x: newRootBounds.x + (childBounds.x - shapeRecord.originalBounds.x) * scaleX,
                    y: newRootBounds.y + (childBounds.y - shapeRecord.originalBounds.y) * scaleY,
                    width: childBounds.width * scaleX,
                    height: childBounds.height * scaleY
                };

                if (!this.boundsAreEqual(childBounds, transformedChildBounds)) {
                    replacements.push({
                        start: valueStart,
                        end: valueEnd,
                        value: this.formatBounds(transformedChildBounds)
                    });
                }
            }

            appliedShapeIds.push(shapeId);
        }

        const connectors = this.collectConnectorRecords(diagramXml);
        for (const connector of connectors) {
            const nextPoints = this.updateConnectorPointsForShapeChanges(
                connector,
                shapeRecords,
                newBoundsByShapeId
            );
            if (!nextPoints) {
                continue;
            }

            replacements.push({
                start: connector.edgePointsValueRange.start,
                end: connector.edgePointsValueRange.end,
                value: this.formatEdgePoints(nextPoints)
            });
        }

        if (!replacements.length) {
            return {
                updatedText: diagramXml,
                appliedShapeIds,
                missingShapeIds
            };
        }

        replacements.sort((a, b) => b.start - a.start);
        let updatedText = diagramXml;

        for (const replacement of replacements) {
            updatedText =
                updatedText.slice(0, replacement.start) +
                replacement.value +
                updatedText.slice(replacement.end);
        }

        return {
            updatedText,
            appliedShapeIds,
            missingShapeIds
        };
    }

    private static collectShapeRecords(diagramXml: string): Map<string, ShapeRecord> {
        const shapeRecords = new Map<string, ShapeRecord>();
        const openingTagRegex = /<(entityShape|entityDcShape|serviceShape|dcAliasShape)\b[^>]*>/g;

        let match: RegExpExecArray | null;
        while ((match = openingTagRegex.exec(diagramXml)) !== null) {
            const tagName = match[1] as (typeof EDITABLE_SHAPE_TAGS)[number];
            const openingTag = match[0];
            const openingTagStart = match.index;
            const openingTagEnd = openingTagStart + openingTag.length;
            const idMatch = /\bId\s*=\s*"([^"]+)"/.exec(openingTag) || /\bid\s*=\s*"([^"]+)"/.exec(openingTag);
            const absoluteBoundsAttrMatch = /absoluteBounds\s*=\s*"([^"]*)"/.exec(openingTag);

            if (!idMatch || !absoluteBoundsAttrMatch) {
                continue;
            }

            const shapeId = idMatch[1];
            const parsedBounds = this.parseBounds(absoluteBoundsAttrMatch[1]);
            if (!parsedBounds) {
                continue;
            }

            if (shapeRecords.has(shapeId)) {
                continue;
            }

            const absoluteBoundsValueOffset = absoluteBoundsAttrMatch.index + absoluteBoundsAttrMatch[0].indexOf('"') + 1;
            const absoluteBoundsValueStart = openingTagStart + absoluteBoundsValueOffset;
            const absoluteBoundsValueEnd = absoluteBoundsValueStart + absoluteBoundsAttrMatch[1].length;

            const selfClosing = /\/\s*>$/.test(openingTag);
            const blockEnd = selfClosing
                ? openingTagEnd
                : (this.findMatchingClosingTagEnd(diagramXml, tagName, openingTagEnd) ?? openingTagEnd);

            shapeRecords.set(shapeId, {
                blockStart: openingTagStart,
                blockEnd,
                absoluteBoundsValueRange: {
                    start: absoluteBoundsValueStart,
                    end: absoluteBoundsValueEnd
                },
                originalBounds: parsedBounds
            });
        }

        return shapeRecords;
    }

    private static collectConnectorRecords(diagramXml: string): ConnectorRecord[] {
        const connectors: ConnectorRecord[] = [];
        const openingTagRegex = /<associationConnector\b[^>]*>/g;
        let match: RegExpExecArray | null;

        while ((match = openingTagRegex.exec(diagramXml)) !== null) {
            const openingTag = match[0];
            const openingTagStart = match.index;
            const openingTagEnd = openingTagStart + openingTag.length;
            const edgePointsAttrMatch = /edgePoints\s*=\s*"([^"]*)"/.exec(openingTag);
            if (!edgePointsAttrMatch) {
                continue;
            }

            const edgePoints = this.parseEdgePoints(edgePointsAttrMatch[1]);
            if (!edgePoints.length) {
                continue;
            }

            const edgePointsValueOffset = edgePointsAttrMatch.index + edgePointsAttrMatch[0].indexOf('"') + 1;
            const edgePointsValueStart = openingTagStart + edgePointsValueOffset;
            const edgePointsValueEnd = edgePointsValueStart + edgePointsAttrMatch[1].length;
            const blockEnd = this.findMatchingClosingTagEnd(diagramXml, 'associationConnector', openingTagEnd) ?? openingTagEnd;
            const blockXml = diagramXml.slice(openingTagStart, blockEnd);
            const nodeShapeIds = this.extractShapeIdsFromNodesBlock(blockXml);

            connectors.push({
                blockStart: openingTagStart,
                blockEnd,
                edgePointsValueRange: {
                    start: edgePointsValueStart,
                    end: edgePointsValueEnd
                },
                originalPoints: edgePoints,
                sourceShapeId: nodeShapeIds[0],
                targetShapeId: nodeShapeIds[1]
            });
        }

        return connectors;
    }

    private static updateConnectorPointsForShapeChanges(
        connector: ConnectorRecord,
        shapeRecords: Map<string, ShapeRecord>,
        newBoundsByShapeId: Map<string, Bounds>
    ): Point[] | null {
        const nextPoints = connector.originalPoints.map(point => ({ x: point.x, y: point.y }));
        let hasChanges = false;

        if (connector.sourceShapeId) {
            const sourceShape = shapeRecords.get(connector.sourceShapeId);
            const sourceNextBounds = newBoundsByShapeId.get(connector.sourceShapeId);
            if (sourceShape && sourceNextBounds) {
                hasChanges = this.updateConnectorEndpoint(
                    nextPoints,
                    connector.originalPoints,
                    0,
                    1,
                    sourceShape.originalBounds,
                    sourceNextBounds
                ) || hasChanges;
            }
        }

        if (connector.targetShapeId) {
            const targetShape = shapeRecords.get(connector.targetShapeId);
            const targetNextBounds = newBoundsByShapeId.get(connector.targetShapeId);
            if (targetShape && targetNextBounds) {
                hasChanges = this.updateConnectorEndpoint(
                    nextPoints,
                    connector.originalPoints,
                    connector.originalPoints.length - 1,
                    connector.originalPoints.length - 2,
                    targetShape.originalBounds,
                    targetNextBounds
                ) || hasChanges;
            }
        }

        return hasChanges ? nextPoints : null;
    }

    private static updateConnectorEndpoint(
        currentPoints: Point[],
        basePoints: Point[],
        endpointIndex: number,
        adjacentIndex: number,
        oldShapeBounds: Bounds,
        newShapeBounds: Bounds
    ): boolean {
        if (endpointIndex < 0 || endpointIndex >= basePoints.length) {
            return false;
        }

        const originalEndpoint = basePoints[endpointIndex];
        const movedEndpoint = this.mapPointRelativeToBounds(originalEndpoint, oldShapeBounds, newShapeBounds);
        let changed = !this.pointsAreEqual(currentPoints[endpointIndex], movedEndpoint);
        currentPoints[endpointIndex] = movedEndpoint;

        // A straight 2-point connector has no bend segment to preserve.
        // Moving the opposite endpoint here would detach it from the other shape.
        if (basePoints.length <= 2) {
            return changed;
        }

        if (adjacentIndex >= 0 && adjacentIndex < basePoints.length) {
            const originalAdjacent = basePoints[adjacentIndex];
            const dx = originalAdjacent.x - originalEndpoint.x;
            const dy = originalAdjacent.y - originalEndpoint.y;
            const keepHorizontal = Math.abs(dx) >= Math.abs(dy);

            const movedAdjacent = keepHorizontal
                ? { x: movedEndpoint.x + dx, y: movedEndpoint.y }
                : { x: movedEndpoint.x, y: movedEndpoint.y + dy };

            if (!this.pointsAreEqual(currentPoints[adjacentIndex], movedAdjacent)) {
                changed = true;
            }
            currentPoints[adjacentIndex] = movedAdjacent;
        }

        return changed;
    }

    private static mapPointRelativeToBounds(point: Point, oldBounds: Bounds, newBounds: Bounds): Point {
        const relativeX = Math.abs(oldBounds.width) < BOUNDS_EPSILON
            ? 0.5
            : (point.x - oldBounds.x) / oldBounds.width;
        const relativeY = Math.abs(oldBounds.height) < BOUNDS_EPSILON
            ? 0.5
            : (point.y - oldBounds.y) / oldBounds.height;

        const normalizedX = Math.min(1, Math.max(0, relativeX));
        const normalizedY = Math.min(1, Math.max(0, relativeY));

        return {
            x: newBounds.x + normalizedX * newBounds.width,
            y: newBounds.y + normalizedY * newBounds.height
        };
    }

    private static extractShapeIdsFromNodesBlock(connectorBlockXml: string): string[] {
        const nodesMatch = /<nodes>([\s\S]*?)<\/nodes>/.exec(connectorBlockXml);
        if (!nodesMatch) {
            return [];
        }

        const ids: string[] = [];
        const monikerRegex = /<[^>]*Moniker\b[^>]*\bId\s*=\s*"([^"]+)"/g;
        let match: RegExpExecArray | null;
        while ((match = monikerRegex.exec(nodesMatch[1])) !== null) {
            ids.push(match[1]);
            if (ids.length >= 2) {
                break;
            }
        }

        return ids;
    }

    private static findMatchingClosingTagEnd(
        xml: string,
        tagName: (typeof EDITABLE_SHAPE_TAGS)[number] | 'associationConnector',
        searchFrom: number
    ): number | null {
        const sameTagRegex = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'g');
        sameTagRegex.lastIndex = searchFrom;

        let depth = 1;
        let match: RegExpExecArray | null;

        while ((match = sameTagRegex.exec(xml)) !== null) {
            const token = match[0];
            const isClosing = token.startsWith('</');
            const isSelfClosing = /\/\s*>$/.test(token);

            if (isClosing) {
                depth -= 1;
            } else if (!isSelfClosing) {
                depth += 1;
            }

            if (depth === 0) {
                return match.index + token.length;
            }
        }

        return null;
    }

    private static parseEdgePoints(edgePointsText: string): Point[] {
        const points: Point[] = [];
        const regex = /\((-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)\)/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(edgePointsText)) !== null) {
            const x = Number.parseFloat(match[1]);
            const y = Number.parseFloat(match[2]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                points.push({ x, y });
            }
        }

        return points;
    }

    private static parseBounds(boundsText: string): Bounds | null {
        const parts = boundsText.split(',').map(part => Number.parseFloat(part.trim()));
        if (parts.length < 4 || parts.some(part => !Number.isFinite(part))) {
            return null;
        }

        return {
            x: parts[0],
            y: parts[1],
            width: parts[2],
            height: parts[3]
        };
    }

    private static formatBounds(bounds: Bounds): string {
        return [
            this.formatNumber(bounds.x),
            this.formatNumber(bounds.y),
            this.formatNumber(bounds.width),
            this.formatNumber(bounds.height)
        ].join(', ');
    }

    private static formatEdgePoints(points: Point[]): string {
        const serializedPoints = points.map(point =>
            `(${this.formatNumber(point.x)} : ${this.formatNumber(point.y)})`
        );
        return `[${serializedPoints.join('; ')}]`;
    }

    private static formatNumber(value: number): string {
        const normalized = Math.abs(value) < BOUNDS_EPSILON ? 0 : value;
        const rounded = Math.round(normalized * 1000000000000) / 1000000000000;
        let text = rounded.toString();

        if (text.includes('e') || text.includes('E')) {
            text = rounded.toFixed(12).replace(/\.?0+$/, '');
        }

        return text;
    }

    private static boundsAreEqual(left: Bounds, right: Bounds): boolean {
        return (
            Math.abs(left.x - right.x) < BOUNDS_EPSILON &&
            Math.abs(left.y - right.y) < BOUNDS_EPSILON &&
            Math.abs(left.width - right.width) < BOUNDS_EPSILON &&
            Math.abs(left.height - right.height) < BOUNDS_EPSILON
        );
    }

    private static pointsAreEqual(left: Point, right: Point): boolean {
        return (
            Math.abs(left.x - right.x) < BOUNDS_EPSILON &&
            Math.abs(left.y - right.y) < BOUNDS_EPSILON
        );
    }
}
