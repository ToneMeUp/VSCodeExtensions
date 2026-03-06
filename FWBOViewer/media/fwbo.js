(function () {
    try {
        const vscode = acquireVsCodeApi();
        const container = document.getElementById('diagram-container');

        if (!fwboData || !fwboData.diagram) {
            container.innerHTML = '<h3>No diagram data found</h3>';
            return;
        }

        const diagram = fwboData.diagram;
        const entities = fwboData.entities;
        const services = fwboData.services;
        const aliases = fwboData.aliases || [];

        const entityMap = new Map(entities.map(e => [e.id, e]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const aliasMap = new Map(aliases.map(a => [a.id, a]));
        const associationMap = new Map(fwboData.associations.map(a => [a.id, a]));

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        let isPanning = false;
        let startPoint = { x: 0, y: 0 };

        const scale = 96;
        const minShapeWidth = 64;
        const minShapeHeight = 36;
        const boundsEpsilon = 0.000001;
        const resizeEdgeHitPx = 8;
        const maxHistoryEntries = 100;

        const shapeStateById = new Map();
        const dirtyChangesById = new Map();
        const selectedShapeIds = new Set();
        let interactionMode = 'idle'; // idle | dragging | resizing | selecting
        let activeShapeInteraction = null;
        let selectionInteraction = null;
        let interactionRafId = null;
        let pendingInteractionUpdate = null;
        let isSavingLayout = false;
        let isSpacePressed = false;
        let canvasToolMode = 'pan'; // pan | select
        let toolModeButton = null;
        let undoButton = null;
        let redoButton = null;
        let selectionIndicator = null;
        let viewToStateSeparator = null;
        const undoStack = [];
        const redoStack = [];

        diagram.shapes.forEach(shape => {
            const x = shape.x * scale;
            const y = shape.y * scale;
            const w = shape.width * scale;
            const h = shape.height * scale;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        diagram.connectors.forEach(conn => {
            conn.points.forEach(p => {
                const x = p.x * scale;
                const y = p.y * scale;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            });
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            minX = 0;
            minY = 0;
            maxX = 1200;
            maxY = 800;
        }

        // Add some padding
        const padding = 40;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const svgWidth = maxX - minX;
        const svgHeight = maxY - minY;
        const originalViewBox = `${minX} ${minY} ${svgWidth} ${svgHeight}`;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', originalViewBox);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        const connectorsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(connectorsGroup);

        let currentViewBox = { x: minX, y: minY, width: svgWidth, height: svgHeight };
        const fullBounds = { x: minX, y: minY, width: svgWidth, height: svgHeight };

        function cloneBounds(bounds) {
            return {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height
            };
        }

        function boundsEqual(a, b) {
            return Math.abs(a.x - b.x) < boundsEpsilon &&
                Math.abs(a.y - b.y) < boundsEpsilon &&
                Math.abs(a.width - b.width) < boundsEpsilon &&
                Math.abs(a.height - b.height) < boundsEpsilon;
        }

        function roundNumber(value) {
            return Math.round(value * 1000000000000) / 1000000000000;
        }

        function toDiagramUnits(value) {
            return roundNumber(value / scale);
        }

        function getSvgPointFromClient(clientX, clientY) {
            const rect = svg.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return null;
            }

            const vb = currentViewBox;
            const scaleFactor = Math.min(rect.width / vb.width, rect.height / vb.height);
            const renderedWidth = vb.width * scaleFactor;
            const renderedHeight = vb.height * scaleFactor;
            const offsetX = rect.left + (rect.width - renderedWidth) / 2;
            const offsetY = rect.top + (rect.height - renderedHeight) / 2;

            return {
                x: vb.x + (clientX - offsetX) / scaleFactor,
                y: vb.y + (clientY - offsetY) / scaleFactor
            };
        }

        function getResizeModeAtClientPoint(shapeState, clientX, clientY) {
            if (!shapeState) {
                return null;
            }

            const rect = shapeState.node.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return null;
            }

            if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
                return null;
            }

            const nearLeft = (clientX - rect.left) <= resizeEdgeHitPx;
            const nearRight = (rect.right - clientX) <= resizeEdgeHitPx;
            const nearTop = (clientY - rect.top) <= resizeEdgeHitPx;
            const nearBottom = (rect.bottom - clientY) <= resizeEdgeHitPx;

            const vertical = nearTop ? 'n' : (nearBottom ? 's' : '');
            const horizontal = nearLeft ? 'w' : (nearRight ? 'e' : '');
            const resizeMode = `${vertical}${horizontal}`;
            return resizeMode || null;
        }

        function getResizeCursorForMode(resizeMode) {
            switch (resizeMode) {
                case 'n':
                case 's':
                    return 'ns-resize';
                case 'e':
                case 'w':
                    return 'ew-resize';
                case 'ne':
                case 'sw':
                    return 'nesw-resize';
                case 'nw':
                case 'se':
                    return 'nwse-resize';
                default:
                    return 'move';
            }
        }

        function updateSelectionUi() {
            shapeStateById.forEach((shapeState, shapeId) => {
                shapeState.node.classList.toggle('selected', selectedShapeIds.has(shapeId));
            });
            updateSelectionSummaryUi();
        }

        function updateSelectionSummaryUi() {
            if (!selectionIndicator) {
                return;
            }

            const selectedCount = selectedShapeIds.size;
            if (selectedCount === 0) {
                selectionIndicator.textContent = '0 selected';
                selectionIndicator.classList.remove('active');
                selectionIndicator.classList.add('muted');
            } else if (selectedCount === 1) {
                selectionIndicator.textContent = '1 selected';
                selectionIndicator.classList.add('active');
                selectionIndicator.classList.remove('muted');
            } else {
                selectionIndicator.textContent = `${selectedCount} selected`;
                selectionIndicator.classList.add('active');
                selectionIndicator.classList.remove('muted');
            }

            updateStateSeparatorVisibility();
        }

        function updateStateSeparatorVisibility() {
            if (!viewToStateSeparator) {
                return;
            }

            viewToStateSeparator.classList.remove('is-hidden');
        }

        function updateHistoryUi() {
            const canUseHistory = !isSavingLayout && interactionMode === 'idle';
            const canUndo = canUseHistory && undoStack.length > 0;
            const canRedo = canUseHistory && redoStack.length > 0;

            if (undoButton) {
                undoButton.disabled = !canUndo;
            }

            if (redoButton) {
                redoButton.disabled = !canRedo;
            }
        }

        function pushHistoryEntry(entry) {
            if (!entry || !entry.changes || !entry.changes.length) {
                return;
            }

            undoStack.push(entry);
            if (undoStack.length > maxHistoryEntries) {
                undoStack.shift();
            }
            redoStack.length = 0;
            updateHistoryUi();
        }

        function buildHistoryEntryFromInteraction(interaction) {
            if (!interaction) {
                return null;
            }

            const mode = interaction._mode || interaction.mode || '';
            const changes = [];

            if (mode === 'dragging' && interaction.shapeIds && interaction.startBoundsByShapeId) {
                for (const shapeId of interaction.shapeIds) {
                    const beforeBounds = interaction.startBoundsByShapeId.get(shapeId);
                    const shapeState = shapeStateById.get(shapeId);
                    if (!beforeBounds || !shapeState) {
                        continue;
                    }

                    const afterBounds = shapeState.current;
                    if (boundsEqual(beforeBounds, afterBounds)) {
                        continue;
                    }

                    changes.push({
                        shapeId,
                        before: cloneBounds(beforeBounds),
                        after: cloneBounds(afterBounds)
                    });
                }
            } else if (mode === 'resizing' && interaction.shapeId && interaction.startBounds) {
                const shapeState = shapeStateById.get(interaction.shapeId);
                if (shapeState && !boundsEqual(interaction.startBounds, shapeState.current)) {
                    changes.push({
                        shapeId: interaction.shapeId,
                        before: cloneBounds(interaction.startBounds),
                        after: cloneBounds(shapeState.current)
                    });
                }
            }

            if (!changes.length) {
                return null;
            }

            changes.sort((a, b) => a.shapeId.localeCompare(b.shapeId));
            return { changes };
        }

        function applyHistoryEntry(entry, direction) {
            if (!entry || !entry.changes || !entry.changes.length) {
                return;
            }

            const targetKey = direction === 'undo' ? 'before' : 'after';
            entry.changes.forEach(change => {
                const targetBounds = change[targetKey];
                if (!targetBounds) {
                    return;
                }
                updateShapeElement(change.shapeId, targetBounds, true);
            });
        }

        function undoLayoutChange() {
            if (isSavingLayout || interactionMode !== 'idle' || undoStack.length === 0) {
                return;
            }

            const entry = undoStack.pop();
            if (!entry) {
                updateHistoryUi();
                return;
            }

            applyHistoryEntry(entry, 'undo');
            redoStack.push(entry);
            updateHistoryUi();
        }

        function redoLayoutChange() {
            if (isSavingLayout || interactionMode !== 'idle' || redoStack.length === 0) {
                return;
            }

            const entry = redoStack.pop();
            if (!entry) {
                updateHistoryUi();
                return;
            }

            applyHistoryEntry(entry, 'redo');
            undoStack.push(entry);
            updateHistoryUi();
        }

        function setSelection(shapeIds) {
            selectedShapeIds.clear();
            for (const shapeId of shapeIds) {
                if (shapeStateById.has(shapeId)) {
                    selectedShapeIds.add(shapeId);
                }
            }
            updateSelectionUi();
        }

        function addToSelection(shapeId) {
            if (!shapeStateById.has(shapeId)) {
                return;
            }
            selectedShapeIds.add(shapeId);
            updateSelectionUi();
        }

        function toggleSelection(shapeId) {
            if (!shapeStateById.has(shapeId)) {
                return;
            }
            if (selectedShapeIds.has(shapeId)) {
                selectedShapeIds.delete(shapeId);
            } else {
                selectedShapeIds.add(shapeId);
            }
            updateSelectionUi();
        }

        function clearSelection() {
            if (selectedShapeIds.size === 0) {
                return;
            }
            selectedShapeIds.clear();
            updateSelectionUi();
        }

        // Clamp viewBox so you can't scroll past the content
        function clampViewBox(vb) {
            const margin = 0.25;
            const marginW = vb.width * margin;
            const marginH = vb.height * margin;
            vb.x = Math.max(fullBounds.x - marginW, Math.min(fullBounds.x + fullBounds.width - vb.width + marginW, vb.x));
            vb.y = Math.max(fullBounds.y - marginH, Math.min(fullBounds.y + fullBounds.height - vb.height + marginH, vb.y));
        }

        // --- Custom Scrollbar Indicators ---
        const hBar = document.createElement('div');
        hBar.className = 'custom-scrollbar custom-scrollbar-h';
        const hThumb = document.createElement('div');
        hThumb.className = 'custom-scrollbar-thumb';
        hBar.appendChild(hThumb);

        const vBar = document.createElement('div');
        vBar.className = 'custom-scrollbar custom-scrollbar-v';
        const vThumb = document.createElement('div');
        vThumb.className = 'custom-scrollbar-thumb';
        vBar.appendChild(vThumb);

        container.appendChild(hBar);
        container.appendChild(vBar);

        // --- Scrollbar drag interaction ---
        let scrollDrag = null;
        let scrollRafId = null;

        function onScrollThumbDown(axis, e) {
            e.preventDefault();
            e.stopPropagation();
            const thumb = axis === 'h' ? hThumb : vThumb;
            const bar = axis === 'h' ? hBar : vBar;
            const barRect = bar.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();
            const currentThumbPx = axis === 'h'
                ? thumbRect.left - barRect.left
                : thumbRect.top - barRect.top;
            const thumbSize = axis === 'h' ? thumbRect.width : thumbRect.height;
            const barSize = axis === 'h' ? barRect.width : barRect.height;

            scrollDrag = {
                axis,
                startMouse: axis === 'h' ? e.clientX : e.clientY,
                startThumbPx: currentThumbPx,
                thumbSize,
                barSize,
                svgPerPx: (axis === 'h' ? fullBounds.width : fullBounds.height) / barSize,
                startVbPos: axis === 'h' ? currentViewBox.x : currentViewBox.y,
            };
            document.body.style.userSelect = 'none';
        }

        hThumb.addEventListener('mousedown', (e) => onScrollThumbDown('h', e));
        vThumb.addEventListener('mousedown', (e) => onScrollThumbDown('v', e));

        window.addEventListener('mousemove', (e) => {
            if (!scrollDrag) return;
            e.preventDefault();
            const d = scrollDrag;
            const mouseNow = d.axis === 'h' ? e.clientX : e.clientY;
            const mouseDelta = mouseNow - d.startMouse;

            const maxTravel = d.barSize - d.thumbSize;
            const newThumbPx = Math.max(0, Math.min(maxTravel, d.startThumbPx + mouseDelta));
            const thumb = d.axis === 'h' ? hThumb : vThumb;
            if (d.axis === 'h') {
                thumb.style.transform = `translate3d(${newThumbPx}px,0,0)`;
            } else {
                thumb.style.transform = `translate3d(0,${newThumbPx}px,0)`;
            }

            if (d.axis === 'h') {
                currentViewBox.x = d.startVbPos + mouseDelta * d.svgPerPx;
            } else {
                currentViewBox.y = d.startVbPos + mouseDelta * d.svgPerPx;
            }
            clampViewBox(currentViewBox);

            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
                svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
                scrollRafId = null;
            });
        });

        window.addEventListener('mousemove', (event) => {
            if (!activeShapeInteraction || interactionMode === 'idle') return;
            event.preventDefault();

            const pointerPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!pointerPoint) return;

            if (interactionMode === 'dragging') {
                const dx = pointerPoint.x - activeShapeInteraction.startPointer.x;
                const dy = pointerPoint.y - activeShapeInteraction.startPointer.y;
                const updates = [];

                activeShapeInteraction.shapeIds.forEach(shapeId => {
                    const startBounds = activeShapeInteraction.startBoundsByShapeId.get(shapeId);
                    if (!startBounds) {
                        return;
                    }
                    updates.push({
                        shapeId,
                        bounds: {
                            x: startBounds.x + dx,
                            y: startBounds.y + dy,
                            width: startBounds.width,
                            height: startBounds.height
                        }
                    });
                });

                pendingInteractionUpdate = {
                    updates
                };
            } else if (interactionMode === 'resizing') {
                const startBounds = activeShapeInteraction.startBounds;
                const dx = pointerPoint.x - activeShapeInteraction.startPointer.x;
                const dy = pointerPoint.y - activeShapeInteraction.startPointer.y;
                const resizeMode = activeShapeInteraction.resizeMode || 'se';
                let nextX = startBounds.x;
                let nextY = startBounds.y;
                let nextWidth = startBounds.width;
                let nextHeight = startBounds.height;

                if (resizeMode.includes('e')) {
                    nextWidth = Math.max(minShapeWidth, startBounds.width + dx);
                }
                if (resizeMode.includes('s')) {
                    nextHeight = Math.max(minShapeHeight, startBounds.height + dy);
                }
                if (resizeMode.includes('w')) {
                    nextWidth = Math.max(minShapeWidth, startBounds.width - dx);
                    nextX = startBounds.x + (startBounds.width - nextWidth);
                }
                if (resizeMode.includes('n')) {
                    nextHeight = Math.max(minShapeHeight, startBounds.height - dy);
                    nextY = startBounds.y + (startBounds.height - nextHeight);
                }

                pendingInteractionUpdate = {
                    updates: [{
                        shapeId: activeShapeInteraction.shapeId,
                        bounds: {
                            x: nextX,
                            y: nextY,
                            width: nextWidth,
                            height: nextHeight
                        }
                    }]
                };
            } else {
                return;
            }

            if (interactionRafId) return;

            interactionRafId = requestAnimationFrame(() => {
                if (pendingInteractionUpdate) {
                    pendingInteractionUpdate.updates.forEach(update => {
                        updateShapeElement(update.shapeId, update.bounds, true);
                    });
                    pendingInteractionUpdate = null;
                }
                interactionRafId = null;
            });
        });

        // --- Scrollbar click-to-jump on track ---
        hBar.addEventListener('mousedown', (e) => {
            if (e.target === hThumb) return;
            e.preventDefault();
            e.stopPropagation();
            const barRect = hBar.getBoundingClientRect();
            const ratio = (e.clientX - barRect.left) / barRect.width;
            currentViewBox.x = fullBounds.x + ratio * fullBounds.width - currentViewBox.width / 2;
            clampViewBox(currentViewBox);
            svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
            updateScrollbars();
        });

        vBar.addEventListener('mousedown', (e) => {
            if (e.target === vThumb) return;
            e.preventDefault();
            e.stopPropagation();
            const barRect = vBar.getBoundingClientRect();
            const ratio = (e.clientY - barRect.top) / barRect.height;
            currentViewBox.y = fullBounds.y + ratio * fullBounds.height - currentViewBox.height / 2;
            clampViewBox(currentViewBox);
            svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
            updateScrollbars();
        });

        // Cache bar dimensions (only change on window resize)
        let hBarWidth = 0, vBarHeight = 0;
        function cacheBarSizes() {
            hBarWidth = hBar.offsetWidth;
            vBarHeight = vBar.offsetHeight;
        }
        requestAnimationFrame(cacheBarSizes);
        window.addEventListener('resize', cacheBarSizes);

        function updateScrollbars() {
            const vb = currentViewBox;
            const hRatio = vb.width / fullBounds.width;
            if (hRatio >= 1) {
                hBar.style.display = 'none';
            } else {
                hBar.style.display = '';
                const thumbPx = Math.max(hRatio * hBarWidth, 30);
                const maxTravel = hBarWidth - thumbPx;
                const progress = (vb.x - fullBounds.x) / (fullBounds.width - vb.width);
                const tx = Math.max(0, Math.min(maxTravel, progress * maxTravel));
                hThumb.style.transform = `translate3d(${tx}px, 0, 0)`;
                hThumb.style.width = thumbPx + 'px';
            }
            const vRatio = vb.height / fullBounds.height;
            if (vRatio >= 1) {
                vBar.style.display = 'none';
            } else {
                vBar.style.display = '';
                const thumbPx = Math.max(vRatio * vBarHeight, 30);
                const maxTravel = vBarHeight - thumbPx;
                const progress = (vb.y - fullBounds.y) / (fullBounds.height - vb.height);
                const ty = Math.max(0, Math.min(maxTravel, progress * maxTravel));
                vThumb.style.transform = `translate3d(0, ${ty}px, 0)`;
                vThumb.style.height = thumbPx + 'px';
            }
        }

        const connectorRenderRecords = [];
        const pathfinding = (typeof window !== 'undefined' && window.PF) ? window.PF : null;
        const connectorRouteCellSize = 10;
        const connectorRoutePadding = 2;
        const connectorRouteAttemptMargins = [64, 128, 256, 384];
        const connectorPortOffset = 16;
        const connectorBoundaryGap = 2;
        const connectorPortInset = 10;
        const connectorPortSampleFractions = [0.2, 0.35, 0.5, 0.65, 0.8];
        const connectorTurnPenalty = 120;
        const cardinalityAlongOffset = 16;
        const cardinalityPerpendicularOffset = 10;
        const maxPortPairCandidates = 36;
        const maxRoutingGridCells = 180000;

        function createMultiplicityLabel(textContent, textAnchor) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'cardinality-label');
            text.setAttribute('text-anchor', textAnchor || 'middle');
            text.textContent = textContent;
            connectorsGroup.appendChild(text);
            return text;
        }

        function getCardinalityLabelPosition(endpoint, adjacent) {
            const dx = adjacent.x - endpoint.x;
            const dy = adjacent.y - endpoint.y;

            if (Math.abs(dx) >= Math.abs(dy)) {
                const stepX = dx === 0 ? 1 : Math.sign(dx);
                return {
                    x: endpoint.x + (stepX * cardinalityAlongOffset),
                    y: endpoint.y - cardinalityPerpendicularOffset
                };
            }

            const stepY = dy === 0 ? 1 : Math.sign(dy);
            return {
                x: endpoint.x + cardinalityPerpendicularOffset,
                y: endpoint.y + (stepY * cardinalityAlongOffset)
            };
        }

        function updateSourceLabelPosition(label, points) {
            if (points.length < 2) return;
            const startPoint = points[0];
            const nextPoint = points[1];
            const position = getCardinalityLabelPosition(startPoint, nextPoint);
            label.setAttribute('x', String(position.x));
            label.setAttribute('y', String(position.y));
        }

        function updateTargetLabelPosition(label, points) {
            if (points.length < 2) return;
            const endPoint = points[points.length - 1];
            const prevPoint = points[points.length - 2];
            const position = getCardinalityLabelPosition(endPoint, prevPoint);
            label.setAttribute('x', String(position.x));
            label.setAttribute('y', String(position.y));
        }

        function applyConnectorGeometry(record, nextPoints) {
            record.points = normalizeOrthogonalPath(nextPoints).map(point => ({ x: point.x, y: point.y }));
            record.polyline.setAttribute(
                'points',
                record.points.map(point => `${point.x},${point.y}`).join(' ')
            );

            if (record.sourceLabel) {
                updateSourceLabelPosition(record.sourceLabel, record.points);
            }
            if (record.targetLabel) {
                updateTargetLabelPosition(record.targetLabel, record.points);
            }
        }

        function mapConnectorPointFromShape(basePoint, shapeState) {
            const oldBounds = shapeState.original;
            const newBounds = shapeState.current;
            const relativeX = Math.abs(oldBounds.width) < boundsEpsilon
                ? 0.5
                : (basePoint.x - oldBounds.x) / oldBounds.width;
            const relativeY = Math.abs(oldBounds.height) < boundsEpsilon
                ? 0.5
                : (basePoint.y - oldBounds.y) / oldBounds.height;
            const normalizedX = Math.max(0, Math.min(1, relativeX));
            const normalizedY = Math.max(0, Math.min(1, relativeY));

            return {
                x: newBounds.x + normalizedX * newBounds.width,
                y: newBounds.y + normalizedY * newBounds.height
            };
        }

        function updateConnectorEndpoint(points, basePoints, endpointIndex, adjacentIndex, shapeState) {
            if (endpointIndex < 0 || endpointIndex >= basePoints.length) {
                return;
            }

            const baseEndpoint = basePoints[endpointIndex];
            const nextEndpoint = mapConnectorPointFromShape(baseEndpoint, shapeState);
            points[endpointIndex] = nextEndpoint;

            // A 2-point connector has no bend to preserve; moving the opposite endpoint detaches it.
            if (basePoints.length <= 2) {
                return;
            }

            if (adjacentIndex < 0 || adjacentIndex >= basePoints.length) {
                return;
            }

            const baseAdjacent = basePoints[adjacentIndex];
            const dx = baseAdjacent.x - baseEndpoint.x;
            const dy = baseAdjacent.y - baseEndpoint.y;
            const keepHorizontal = Math.abs(dx) >= Math.abs(dy);
            points[adjacentIndex] = keepHorizontal
                ? { x: nextEndpoint.x + dx, y: nextEndpoint.y }
                : { x: nextEndpoint.x, y: nextEndpoint.y + dy };
        }

        function clampGridIndex(value, maxExclusive) {
            if (maxExclusive <= 0) {
                return 0;
            }
            return Math.max(0, Math.min(maxExclusive - 1, value));
        }

        function pointToGridCell(point, routeBounds) {
            return {
                col: clampGridIndex(Math.round((point.x - routeBounds.minX) / connectorRouteCellSize), routeBounds.cols),
                row: clampGridIndex(Math.round((point.y - routeBounds.minY) / connectorRouteCellSize), routeBounds.rows)
            };
        }

        function gridCellToPoint(col, row, routeBounds) {
            return {
                x: routeBounds.minX + col * connectorRouteCellSize,
                y: routeBounds.minY + row * connectorRouteCellSize
            };
        }

        function getPrimaryDirection(fromPoint, toPoint) {
            const dx = toPoint.x - fromPoint.x;
            const dy = toPoint.y - fromPoint.y;
            if (Math.abs(dx) >= Math.abs(dy)) {
                return dx >= 0 ? 'e' : 'w';
            }
            return dy >= 0 ? 's' : 'n';
        }

        function getOppositeDirection(direction) {
            switch (direction) {
                case 'n': return 's';
                case 's': return 'n';
                case 'e': return 'w';
                case 'w': return 'e';
                default: return direction;
            }
        }

        function offsetPoint(point, direction, distance) {
            switch (direction) {
                case 'n':
                    return { x: point.x, y: point.y - distance };
                case 's':
                    return { x: point.x, y: point.y + distance };
                case 'e':
                    return { x: point.x + distance, y: point.y };
                case 'w':
                    return { x: point.x - distance, y: point.y };
                default:
                    return { x: point.x, y: point.y };
            }
        }

        function markCellWalkable(grid, cell, walkable) {
            if (!cell) {
                return;
            }
            const width = grid.width;
            const height = grid.height;
            if (cell.col < 0 || cell.col >= width || cell.row < 0 || cell.row >= height) {
                return;
            }
            grid.setWalkableAt(cell.col, cell.row, walkable);
        }

        function dedupeConnectorPoints(points) {
            if (!points.length) {
                return points;
            }

            const deduped = [points[0]];
            for (let i = 1; i < points.length; i += 1) {
                const prev = deduped[deduped.length - 1];
                const current = points[i];
                if (Math.abs(prev.x - current.x) < 0.5 && Math.abs(prev.y - current.y) < 0.5) {
                    continue;
                }
                deduped.push(current);
            }
            return deduped;
        }

        function simplifyOrthogonalPath(worldPath) {
            if (worldPath.length <= 2) {
                return worldPath;
            }

            const simplified = [worldPath[0]];
            for (let i = 1; i < worldPath.length - 1; i += 1) {
                const prev = worldPath[i - 1];
                const curr = worldPath[i];
                const next = worldPath[i + 1];
                const dirAX = Math.sign(curr.x - prev.x);
                const dirAY = Math.sign(curr.y - prev.y);
                const dirBX = Math.sign(next.x - curr.x);
                const dirBY = Math.sign(next.y - curr.y);
                if (dirAX !== dirBX || dirAY !== dirBY) {
                    simplified.push(curr);
                }
            }
            simplified.push(worldPath[worldPath.length - 1]);
            return simplified;
        }

        function snapCoordinate(value) {
            return Math.round(value * 2) / 2;
        }

        function snapPoint(point) {
            return {
                x: snapCoordinate(point.x),
                y: snapCoordinate(point.y)
            };
        }

        function pickOrthogonalCorner(prev, next, lookahead) {
            const cornerA = { x: next.x, y: prev.y };
            const cornerB = { x: prev.x, y: next.y };

            if (lookahead) {
                const aAligned = Math.abs(lookahead.x - cornerA.x) < 0.01 || Math.abs(lookahead.y - cornerA.y) < 0.01;
                const bAligned = Math.abs(lookahead.x - cornerB.x) < 0.01 || Math.abs(lookahead.y - cornerB.y) < 0.01;
                if (aAligned && !bAligned) {
                    return cornerA;
                }
                if (bAligned && !aAligned) {
                    return cornerB;
                }
            }

            const dx = Math.abs(next.x - prev.x);
            const dy = Math.abs(next.y - prev.y);
            return dx >= dy ? cornerA : cornerB;
        }

        function normalizeOrthogonalPath(points) {
            if (!points.length) {
                return points;
            }

            const snapped = points.map(snapPoint);
            const orthogonal = [snapped[0]];

            for (let i = 1; i < snapped.length; i += 1) {
                const current = snapped[i];
                const previous = orthogonal[orthogonal.length - 1];
                if (Math.abs(previous.x - current.x) < 0.01 && Math.abs(previous.y - current.y) < 0.01) {
                    continue;
                }

                if (Math.abs(previous.x - current.x) >= 0.01 && Math.abs(previous.y - current.y) >= 0.01) {
                    const lookahead = i + 1 < snapped.length ? snapped[i + 1] : null;
                    const corner = pickOrthogonalCorner(previous, current, lookahead);
                    const last = orthogonal[orthogonal.length - 1];
                    if (Math.abs(last.x - corner.x) >= 0.01 || Math.abs(last.y - corner.y) >= 0.01) {
                        orthogonal.push(corner);
                    }
                }

                const last = orthogonal[orthogonal.length - 1];
                if (Math.abs(last.x - current.x) >= 0.01 || Math.abs(last.y - current.y) >= 0.01) {
                    orthogonal.push(current);
                }
            }

            return dedupeConnectorPoints(simplifyOrthogonalPath(orthogonal));
        }

        function computePathLength(points) {
            let length = 0;
            for (let i = 1; i < points.length; i += 1) {
                length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
            }
            return length;
        }

        function computeTurnCount(points) {
            if (points.length < 3) {
                return 0;
            }
            let turns = 0;
            for (let i = 1; i < points.length - 1; i += 1) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];
                const dx1 = Math.sign(curr.x - prev.x);
                const dy1 = Math.sign(curr.y - prev.y);
                const dx2 = Math.sign(next.x - curr.x);
                const dy2 = Math.sign(next.y - curr.y);
                if (dx1 !== dx2 || dy1 !== dy2) {
                    turns += 1;
                }
            }
            return turns;
        }

        function scorePath(points) {
            return computePathLength(points) + (computeTurnCount(points) * connectorTurnPenalty);
        }

        function getShapeCenter(bounds) {
            return {
                x: bounds.x + (bounds.width / 2),
                y: bounds.y + (bounds.height / 2)
            };
        }

        function getSideCoordinateRange(bounds, side) {
            if (side === 'e' || side === 'w') {
                const min = bounds.y + Math.min(connectorPortInset, bounds.height / 2);
                const max = bounds.y + bounds.height - Math.min(connectorPortInset, bounds.height / 2);
                return { min, max };
            }
            const min = bounds.x + Math.min(connectorPortInset, bounds.width / 2);
            const max = bounds.x + bounds.width - Math.min(connectorPortInset, bounds.width / 2);
            return { min, max };
        }

        function clampToSideRange(bounds, side, value) {
            const range = getSideCoordinateRange(bounds, side);
            if (range.max < range.min) {
                return (range.min + range.max) / 2;
            }
            return Math.max(range.min, Math.min(range.max, value));
        }

        function getNearestSide(bounds, point) {
            const distances = [
                { side: 'n', distance: Math.abs(point.y - bounds.y) },
                { side: 's', distance: Math.abs(point.y - (bounds.y + bounds.height)) },
                { side: 'w', distance: Math.abs(point.x - bounds.x) },
                { side: 'e', distance: Math.abs(point.x - (bounds.x + bounds.width)) }
            ];
            distances.sort((a, b) => a.distance - b.distance);
            return distances[0].side;
        }

        function createShapePort(bounds, side, coordinate, sideRank) {
            if (side === 'e') {
                return {
                    side,
                    sideRank,
                    boundary: { x: bounds.x + bounds.width + connectorBoundaryGap, y: coordinate },
                    outer: { x: bounds.x + bounds.width + connectorBoundaryGap + connectorPortOffset, y: coordinate }
                };
            }
            if (side === 'w') {
                return {
                    side,
                    sideRank,
                    boundary: { x: bounds.x - connectorBoundaryGap, y: coordinate },
                    outer: { x: bounds.x - connectorBoundaryGap - connectorPortOffset, y: coordinate }
                };
            }
            if (side === 's') {
                return {
                    side,
                    sideRank,
                    boundary: { x: coordinate, y: bounds.y + bounds.height + connectorBoundaryGap },
                    outer: { x: coordinate, y: bounds.y + bounds.height + connectorBoundaryGap + connectorPortOffset }
                };
            }
            return {
                side: 'n',
                sideRank,
                boundary: { x: coordinate, y: bounds.y - connectorBoundaryGap },
                outer: { x: coordinate, y: bounds.y - connectorBoundaryGap - connectorPortOffset }
            };
        }

        function buildSidePortCandidates(bounds, side, towardPoint, referencePoint, sideRank) {
            const candidateCoordinates = [];
            const dedupe = new Set();

            function pushCoordinate(value) {
                const clamped = clampToSideRange(bounds, side, value);
                const key = Math.round(clamped * 10) / 10;
                if (dedupe.has(key)) {
                    return;
                }
                dedupe.add(key);
                candidateCoordinates.push(clamped);
            }

            if (side === 'e' || side === 'w') {
                pushCoordinate(towardPoint.y);
                if (referencePoint) {
                    pushCoordinate(referencePoint.y);
                }
                const base = bounds.y;
                for (const fraction of connectorPortSampleFractions) {
                    pushCoordinate(base + bounds.height * fraction);
                }
            } else {
                pushCoordinate(towardPoint.x);
                if (referencePoint) {
                    pushCoordinate(referencePoint.x);
                }
                const base = bounds.x;
                for (const fraction of connectorPortSampleFractions) {
                    pushCoordinate(base + bounds.width * fraction);
                }
            }

            return candidateCoordinates.map(coordinate => createShapePort(bounds, side, coordinate, sideRank));
        }

        function getPreferredSides(fromBounds, toBounds) {
            const fromCenter = getShapeCenter(fromBounds);
            const toCenter = getShapeCenter(toBounds);
            const dx = toCenter.x - fromCenter.x;
            const dy = toCenter.y - fromCenter.y;

            let ordered = [];
            if (Math.abs(dx) >= Math.abs(dy)) {
                ordered = [
                    dx >= 0 ? 'e' : 'w',
                    dy >= 0 ? 's' : 'n',
                    dy >= 0 ? 'n' : 's',
                    dx >= 0 ? 'w' : 'e'
                ];
            } else {
                ordered = [
                    dy >= 0 ? 's' : 'n',
                    dx >= 0 ? 'e' : 'w',
                    dx >= 0 ? 'w' : 'e',
                    dy >= 0 ? 'n' : 's'
                ];
            }

            const uniqueSides = [];
            for (const side of ordered) {
                if (!uniqueSides.includes(side)) {
                    uniqueSides.push(side);
                }
            }
            return uniqueSides;
        }

        function buildPortPairCandidates(sourceBounds, targetBounds, sourceReferencePoint, targetReferencePoint) {
            const sourceSides = getPreferredSides(sourceBounds, targetBounds);
            const targetSides = getPreferredSides(targetBounds, sourceBounds);
            const sourceTowardPoint = getShapeCenter(targetBounds);
            const targetTowardPoint = getShapeCenter(sourceBounds);
            const sourceRefSide = sourceReferencePoint ? getNearestSide(sourceBounds, sourceReferencePoint) : null;
            const targetRefSide = targetReferencePoint ? getNearestSide(targetBounds, targetReferencePoint) : null;

            const sourcePorts = [];
            sourceSides.forEach((side, index) => {
                const referencePoint = sourceRefSide === side ? sourceReferencePoint : null;
                sourcePorts.push(...buildSidePortCandidates(sourceBounds, side, sourceTowardPoint, referencePoint, index));
            });

            const targetPorts = [];
            targetSides.forEach((side, index) => {
                const referencePoint = targetRefSide === side ? targetReferencePoint : null;
                targetPorts.push(...buildSidePortCandidates(targetBounds, side, targetTowardPoint, referencePoint, index));
            });

            const scoredPairs = [];
            for (const sourcePort of sourcePorts) {
                for (const targetPort of targetPorts) {
                    const baseDistance = Math.abs(sourcePort.outer.x - targetPort.outer.x) +
                        Math.abs(sourcePort.outer.y - targetPort.outer.y);
                    const sideRankPenalty = (sourcePort.sideRank + targetPort.sideRank) * 8;
                    const score = baseDistance + sideRankPenalty;
                    scoredPairs.push({
                        score,
                        sourcePort,
                        targetPort
                    });
                }
            }

            scoredPairs.sort((a, b) => a.score - b.score);
            const seen = new Set();
            const pairs = [];
            for (const candidate of scoredPairs) {
                const key = `${candidate.sourcePort.side}:${Math.round(candidate.sourcePort.boundary.x * 10)},${Math.round(candidate.sourcePort.boundary.y * 10)}->${candidate.targetPort.side}:${Math.round(candidate.targetPort.boundary.x * 10)},${Math.round(candidate.targetPort.boundary.y * 10)}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                pairs.push({
                    sourcePort: candidate.sourcePort,
                    targetPort: candidate.targetPort
                });
                if (pairs.length >= maxPortPairCandidates) {
                    break;
                }
            }

            return pairs;
        }

        function resolveConnectorEndpoint(record, isSourceEndpoint) {
            const endpointIndex = isSourceEndpoint ? 0 : (record.originalPoints.length - 1);
            const basePoint = record.originalPoints[endpointIndex];
            const shapeId = isSourceEndpoint ? record.sourceShapeId : record.targetShapeId;
            if (!shapeId) {
                return { x: basePoint.x, y: basePoint.y };
            }
            const shapeState = shapeStateById.get(shapeId);
            if (!shapeState) {
                return { x: basePoint.x, y: basePoint.y };
            }
            return mapConnectorPointFromShape(basePoint, shapeState);
        }

        function buildRoutingGrid(startPoint, endPoint, record, margin) {
            const routeBounds = {
                minX: Math.min(startPoint.x, endPoint.x) - margin,
                minY: Math.min(startPoint.y, endPoint.y) - margin,
                maxX: Math.max(startPoint.x, endPoint.x) + margin,
                maxY: Math.max(startPoint.y, endPoint.y) + margin,
                cols: 0,
                rows: 0
            };
            routeBounds.cols = Math.max(2, Math.ceil((routeBounds.maxX - routeBounds.minX) / connectorRouteCellSize) + 1);
            routeBounds.rows = Math.max(2, Math.ceil((routeBounds.maxY - routeBounds.minY) / connectorRouteCellSize) + 1);
            if ((routeBounds.cols * routeBounds.rows) > maxRoutingGridCells) {
                return null;
            }

            const grid = new pathfinding.Grid(routeBounds.cols, routeBounds.rows);

            shapeStateById.forEach((shapeState, shapeId) => {
                const bounds = shapeState.current;
                const padding = (shapeId === record.sourceShapeId || shapeId === record.targetShapeId)
                    ? 2
                    : connectorRoutePadding;
                const obstacleMinX = bounds.x - padding;
                const obstacleMinY = bounds.y - padding;
                const obstacleMaxX = bounds.x + bounds.width + padding;
                const obstacleMaxY = bounds.y + bounds.height + padding;

                if (obstacleMaxX < routeBounds.minX || obstacleMinX > routeBounds.maxX ||
                    obstacleMaxY < routeBounds.minY || obstacleMinY > routeBounds.maxY) {
                    return;
                }

                const startCol = clampGridIndex(Math.floor((obstacleMinX - routeBounds.minX) / connectorRouteCellSize), routeBounds.cols);
                const endCol = clampGridIndex(Math.ceil((obstacleMaxX - routeBounds.minX) / connectorRouteCellSize), routeBounds.cols);
                const startRow = clampGridIndex(Math.floor((obstacleMinY - routeBounds.minY) / connectorRouteCellSize), routeBounds.rows);
                const endRow = clampGridIndex(Math.ceil((obstacleMaxY - routeBounds.minY) / connectorRouteCellSize), routeBounds.rows);

                for (let row = startRow; row <= endRow; row += 1) {
                    for (let col = startCol; col <= endCol; col += 1) {
                        grid.setWalkableAt(col, row, false);
                    }
                }
            });

            return { grid, routeBounds };
        }

        function findGridRoute(record, startPoint, endPoint, startDirection, endDirection) {
            let best = null;

            for (const margin of connectorRouteAttemptMargins) {
                const routingGrid = buildRoutingGrid(startPoint, endPoint, record, margin);
                if (!routingGrid) {
                    continue;
                }

                const { grid, routeBounds } = routingGrid;
                const startCell = pointToGridCell(startPoint, routeBounds);
                const endCell = pointToGridCell(endPoint, routeBounds);
                markCellWalkable(grid, startCell, true);
                markCellWalkable(grid, endCell, true);
                markCellWalkable(grid, pointToGridCell(offsetPoint(startPoint, startDirection, connectorRouteCellSize), routeBounds), true);
                markCellWalkable(grid, pointToGridCell(offsetPoint(endPoint, endDirection, connectorRouteCellSize), routeBounds), true);

                const finder = new pathfinding.AStarFinder({
                    allowDiagonal: false,
                    dontCrossCorners: true,
                    heuristic: pathfinding.Heuristic.manhattan
                });
                const path = finder.findPath(startCell.col, startCell.row, endCell.col, endCell.row, grid);
                if (!path || path.length < 2) {
                    continue;
                }

                const worldPath = path.map(([col, row]) => gridCellToPoint(col, row, routeBounds));
                if (!worldPath.length) {
                    continue;
                }
                worldPath[0] = { x: startPoint.x, y: startPoint.y };
                worldPath[worldPath.length - 1] = { x: endPoint.x, y: endPoint.y };

                const candidate = normalizeOrthogonalPath(worldPath);
                if (candidate.length < 2) {
                    continue;
                }
                const score = scorePath(candidate);
                if (!best || score < best.score) {
                    best = { points: candidate, score };
                }
            }

            return best;
        }

        function routeConnectorPoints(record) {
            if (!pathfinding || record.originalPoints.length < 2) {
                return null;
            }

            const sourceShapeState = record.sourceShapeId ? shapeStateById.get(record.sourceShapeId) : null;
            const targetShapeState = record.targetShapeId ? shapeStateById.get(record.targetShapeId) : null;

            if (sourceShapeState && targetShapeState) {
                const sourceReferencePoint = resolveConnectorEndpoint(record, true);
                const targetReferencePoint = resolveConnectorEndpoint(record, false);
                const portPairs = buildPortPairCandidates(
                    sourceShapeState.current,
                    targetShapeState.current,
                    sourceReferencePoint,
                    targetReferencePoint
                );
                let bestPath = null;

                for (const pair of portPairs) {
                    const routeResult = findGridRoute(
                        record,
                        pair.sourcePort.outer,
                        pair.targetPort.outer,
                        pair.sourcePort.side,
                        pair.targetPort.side
                    );

                    if (!routeResult) {
                        continue;
                    }

                    const withBoundaryPoints = normalizeOrthogonalPath([
                        pair.sourcePort.boundary,
                        ...routeResult.points,
                        pair.targetPort.boundary
                    ]);
                    if (withBoundaryPoints.length < 2) {
                        continue;
                    }

                    const score = scorePath(withBoundaryPoints);
                    if (!bestPath || score < bestPath.score) {
                        bestPath = { points: withBoundaryPoints, score };
                    }
                }

                if (bestPath) {
                    return bestPath.points;
                }
            }

            const startPoint = resolveConnectorEndpoint(record, true);
            const endPoint = resolveConnectorEndpoint(record, false);
            const sourceAdjacentBase = record.originalPoints[Math.min(1, record.originalPoints.length - 1)];
            const sourceDirection = getPrimaryDirection(record.originalPoints[0], sourceAdjacentBase);
            const targetIndex = record.originalPoints.length - 1;
            const targetAdjacentBase = record.originalPoints[Math.max(0, targetIndex - 1)];
            const targetDirection = getOppositeDirection(getPrimaryDirection(targetAdjacentBase, record.originalPoints[targetIndex]));
            const routeResult = findGridRoute(record, startPoint, endPoint, sourceDirection, targetDirection);
            return routeResult ? routeResult.points : null;
        }

        function recomputeConnectorPointsFallback(record) {
            const nextPoints = record.originalPoints.map(point => ({ x: point.x, y: point.y }));

            if (record.sourceShapeId) {
                const sourceShapeState = shapeStateById.get(record.sourceShapeId);
                if (sourceShapeState) {
                    updateConnectorEndpoint(nextPoints, record.originalPoints, 0, 1, sourceShapeState);
                }
            }

            if (record.targetShapeId) {
                const targetShapeState = shapeStateById.get(record.targetShapeId);
                if (targetShapeState) {
                    const lastIndex = record.originalPoints.length - 1;
                    updateConnectorEndpoint(nextPoints, record.originalPoints, lastIndex, lastIndex - 1, targetShapeState);
                }
            }

            return nextPoints;
        }

        function recomputeConnectorPoints(record) {
            if (pathfinding) {
                const routedPoints = routeConnectorPoints(record);
                if (routedPoints && routedPoints.length >= 2) {
                    return routedPoints;
                }
            }

            return recomputeConnectorPointsFallback(record);
        }

        function refreshConnectorsForShape(shapeId) {
            for (const record of connectorRenderRecords) {
                if (record.sourceShapeId !== shapeId && record.targetShapeId !== shapeId) {
                    continue;
                }
                applyConnectorGeometry(record, recomputeConnectorPoints(record));
            }
        }

        function getSelectionRectBounds(startPoint, endPoint) {
            return {
                x: Math.min(startPoint.x, endPoint.x),
                y: Math.min(startPoint.y, endPoint.y),
                width: Math.abs(endPoint.x - startPoint.x),
                height: Math.abs(endPoint.y - startPoint.y)
            };
        }

        function showSelectionRect(bounds) {
            selectionRect.style.display = '';
            selectionRect.setAttribute('x', String(bounds.x));
            selectionRect.setAttribute('y', String(bounds.y));
            selectionRect.setAttribute('width', String(bounds.width));
            selectionRect.setAttribute('height', String(bounds.height));
        }

        function hideSelectionRect() {
            selectionRect.style.display = 'none';
        }

        function shapeIntersectsRect(shapeBounds, rectBounds) {
            return (
                shapeBounds.x < rectBounds.x + rectBounds.width &&
                shapeBounds.x + shapeBounds.width > rectBounds.x &&
                shapeBounds.y < rectBounds.y + rectBounds.height &&
                shapeBounds.y + shapeBounds.height > rectBounds.y
            );
        }

        function getShapeIdsInRect(rectBounds) {
            const ids = [];
            shapeStateById.forEach((shapeState, shapeId) => {
                if (shapeIntersectsRect(shapeState.current, rectBounds)) {
                    ids.push(shapeId);
                }
            });
            return ids;
        }

        function startSelectionInteraction(event, additiveSelection) {
            const startPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!startPoint) {
                return;
            }

            interactionMode = 'selecting';
            selectionInteraction = {
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPoint,
                currentPoint: startPoint,
                additiveSelection,
                baseSelection: additiveSelection ? new Set(selectedShapeIds) : new Set(),
                hasDragged: false
            };

            showSelectionRect({
                x: startPoint.x,
                y: startPoint.y,
                width: 0,
                height: 0
            });
            document.body.style.userSelect = 'none';
            updateHistoryUi();
        }

        function updateSelectionInteraction(event) {
            if (!selectionInteraction) {
                return;
            }

            const currentPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!currentPoint) {
                return;
            }

            selectionInteraction.currentPoint = currentPoint;
            const dx = event.clientX - selectionInteraction.startClientX;
            const dy = event.clientY - selectionInteraction.startClientY;
            const movedEnough = Math.abs(dx) > 4 || Math.abs(dy) > 4;
            if (!movedEnough && !selectionInteraction.hasDragged) {
                return;
            }

            selectionInteraction.hasDragged = true;
            const rectBounds = getSelectionRectBounds(selectionInteraction.startPoint, currentPoint);
            showSelectionRect(rectBounds);

            const hitShapeIds = getShapeIdsInRect(rectBounds);
            if (selectionInteraction.additiveSelection) {
                const merged = new Set(selectionInteraction.baseSelection);
                for (const shapeId of hitShapeIds) {
                    merged.add(shapeId);
                }
                setSelection(Array.from(merged));
            } else {
                setSelection(hitShapeIds);
            }
        }

        function endSelectionInteraction() {
            if (!selectionInteraction) {
                return;
            }

            if (!selectionInteraction.hasDragged && !selectionInteraction.additiveSelection) {
                clearSelection();
            }

            selectionInteraction = null;
            interactionMode = 'idle';
            hideSelectionRect();
            document.body.style.userSelect = '';
            updateHistoryUi();
            updateCanvasCursor();
        }

        diagram.connectors.forEach(connector => {
            const association = associationMap.get(connector.associationId);
            const points = connector.points.map(point => ({ x: point.x * scale, y: point.y * scale }));
            if (!points.length) {
                return;
            }

            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('class', 'connector');
            connectorsGroup.appendChild(polyline);

            const record = {
                id: connector.id,
                associationId: connector.associationId,
                sourceShapeId: connector.sourceShapeId || null,
                targetShapeId: connector.targetShapeId || null,
                originalPoints: points.map(point => ({ x: point.x, y: point.y })),
                points: points.map(point => ({ x: point.x, y: point.y })),
                polyline,
                sourceLabel: null,
                targetLabel: null
            };

            if (association && points.length >= 2) {
                if (association.sourceMultiplicity) {
                    record.sourceLabel = createMultiplicityLabel(association.sourceMultiplicity, null);
                }
                if (association.targetMultiplicity) {
                    record.targetLabel = createMultiplicityLabel(association.targetMultiplicity, 'middle');
                }
            }

            applyConnectorGeometry(record, record.points);
            connectorRenderRecords.push(record);
        });

        const shapesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        shapesGroup.style.willChange = 'transform';
        svg.appendChild(shapesGroup);

        const selectionOverlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        selectionRect.setAttribute('class', 'selection-rect');
        selectionRect.style.display = 'none';
        selectionOverlayGroup.appendChild(selectionRect);
        svg.appendChild(selectionOverlayGroup);

        function updateShapeElement(shapeId, newBounds, markDirty) {
            const shapeState = shapeStateById.get(shapeId);
            if (!shapeState) return;

            shapeState.current = cloneBounds(newBounds);
            const fo = shapeState.foreignObject;
            fo.setAttribute('x', String(newBounds.x));
            fo.setAttribute('y', String(newBounds.y));
            fo.setAttribute('width', String(newBounds.width));
            fo.setAttribute('height', String(newBounds.height));

            const node = shapeState.node;
            node.dataset.x = String(newBounds.x);
            node.dataset.y = String(newBounds.y);
            node.dataset.w = String(newBounds.width);
            node.dataset.h = String(newBounds.height);
            refreshConnectorsForShape(shapeId);

            if (markDirty) {
                if (boundsEqual(shapeState.current, shapeState.original)) {
                    dirtyChangesById.delete(shapeId);
                    node.classList.remove('layout-dirty');
                } else {
                    dirtyChangesById.set(shapeId, cloneBounds(shapeState.current));
                    node.classList.add('layout-dirty');
                }
                updateLayoutDirtyUi();
            }
        }

        function beginShapeDrag(shapeId, event) {
            if (interactionMode !== 'idle' || isSavingLayout) return;
            const shapeState = shapeStateById.get(shapeId);
            if (!shapeState) return;

            const pointerPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!pointerPoint) return;

            const dragShapeIds = selectedShapeIds.has(shapeId)
                ? Array.from(selectedShapeIds)
                : [shapeId];
            const startBoundsByShapeId = new Map();
            for (const dragShapeId of dragShapeIds) {
                const dragShapeState = shapeStateById.get(dragShapeId);
                if (!dragShapeState) {
                    continue;
                }
                startBoundsByShapeId.set(dragShapeId, cloneBounds(dragShapeState.current));
                dragShapeState.node.classList.add('layout-interacting');
            }
            if (!startBoundsByShapeId.size) {
                return;
            }

            interactionMode = 'dragging';
            activeShapeInteraction = {
                shapeIds: Array.from(startBoundsByShapeId.keys()),
                startPointer: pointerPoint,
                startBoundsByShapeId
            };
            document.body.style.userSelect = 'none';
            updateHistoryUi();
        }

        function beginShapeResize(shapeId, event, resizeMode) {
            if (interactionMode !== 'idle' || isSavingLayout) return;
            const shapeState = shapeStateById.get(shapeId);
            if (!shapeState) return;

            const pointerPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!pointerPoint) return;
            const resolvedResizeMode = resizeMode || getResizeModeAtClientPoint(shapeState, event.clientX, event.clientY) || 'se';

            interactionMode = 'resizing';
            activeShapeInteraction = {
                shapeId,
                startPointer: pointerPoint,
                startBounds: cloneBounds(shapeState.current),
                resizeMode: resolvedResizeMode
            };

            shapeState.node.classList.add('layout-interacting');
            shapeState.node.style.cursor = getResizeCursorForMode(resolvedResizeMode);
            document.body.style.userSelect = 'none';
            updateHistoryUi();
        }

        function endShapeInteraction() {
            if (!activeShapeInteraction) return;
            const completedInteraction = activeShapeInteraction;
            const completedInteractionMode = interactionMode;

            if (interactionRafId) {
                cancelAnimationFrame(interactionRafId);
                interactionRafId = null;
            }

            if (pendingInteractionUpdate) {
                pendingInteractionUpdate.updates.forEach(update => {
                    updateShapeElement(update.shapeId, update.bounds, true);
                });
                pendingInteractionUpdate = null;
            }

            shapeStateById.forEach(shapeState => {
                shapeState.node.classList.remove('layout-interacting');
                shapeState.node.style.cursor = 'move';
            });

            activeShapeInteraction = null;
            interactionMode = 'idle';
            document.body.style.userSelect = '';
            const historyEntry = buildHistoryEntryFromInteraction({
                ...completedInteraction,
                _mode: completedInteractionMode
            });
            if (historyEntry) {
                pushHistoryEntry(historyEntry);
            } else {
                updateHistoryUi();
            }
            updateCanvasCursor();
        }

        function buildNodeContent(shape) {
            const x = shape.x * scale;
            const y = shape.y * scale;
            const w = shape.width * scale;
            const h = shape.height * scale;

            const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            fo.setAttribute('x', x);
            fo.setAttribute('y', y);
            fo.setAttribute('width', w);
            fo.setAttribute('height', h);
            fo.dataset.shapeId = shape.id;

            const div = document.createElement('div');
            div.className = 'node-container';
            div.dataset.x = x;
            div.dataset.y = y;
            div.dataset.w = w;
            div.dataset.h = h;
            div.dataset.shapeId = shape.id;

            if (shape.type === 'entity') {
                div.classList.add('entity-node');
                const entity = entityMap.get(shape.modelId);
                if (entity) {
                    const header = document.createElement('div');
                    header.className = 'node-header';
                    header.textContent = entity.name;
                    div.appendChild(header);

                    if (entity.properties && entity.properties.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'node-section';
                        const propsHtml = entity.properties.slice(0, 15).map(prop => 
                            `<div class="node-item"><span class="property-name">${prop.name}</span><span class="property-type">${prop.type}</span></div>`
                        ).join('');
                        section.innerHTML = propsHtml;
                        div.appendChild(section);
                    }

                    if (entity.navigationProperties && entity.navigationProperties.length > 0) {
                        if (entity.properties && entity.properties.length > 0) {
                            const separator = document.createElement('div');
                            separator.className = 'section-separator';
                            div.appendChild(separator);
                        }

                        const navSection = document.createElement('div');
                        navSection.className = 'node-section navigation-section';
                        const navHtml = entity.navigationProperties.map(navProp => 
                            `<div class="node-item navigation-item">${navProp}</div>`
                        ).join('');
                        navSection.innerHTML = navHtml;
                        div.appendChild(navSection);
                    }

                } else {
                    div.innerHTML = '<div class="node-header">Unknown Entity</div>';
                }
            } else if (shape.type === 'service') {
                div.classList.add('service-node');
                const service = serviceMap.get(shape.modelId);
                if (service) {
                    const header = document.createElement('div');
                    header.className = 'node-header';
                    header.textContent = service.name;
                    div.appendChild(header);

                    if (service.operations && service.operations.length > 0) {
                        const section = document.createElement('div');
                        section.className = 'node-section';
                        const opsHtml = service.operations.map(op => 
                            `<div class="node-item"><span class="operation-name">${op.name}</span></div>`
                        ).join('');
                        section.innerHTML = opsHtml;
                        div.appendChild(section);
                    }
                } else {
                    div.innerHTML = '<div class="node-header">Unknown Service</div>';
                }
            } else if (shape.type === 'alias') {
                div.classList.add('alias-node');
                const alias = aliasMap.get(shape.modelId);
                if (alias) {
                    div.innerHTML = `<div class="node-header">${alias.dcName}</div><div class="alias-ref">(Alias)</div>`;
                } else {
                    div.innerHTML = '<div class="node-header">Unknown Alias</div>';
                }
            }

            div.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                const target = event.target;
                if (!(target instanceof Element)) return;

                const shapeState = shapeStateById.get(shape.id);
                const resizeMode = (!event.ctrlKey && !event.metaKey && !event.shiftKey)
                    ? getResizeModeAtClientPoint(shapeState, event.clientX, event.clientY)
                    : null;
                if (resizeMode) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!selectedShapeIds.has(shape.id) || selectedShapeIds.size !== 1) {
                        setSelection([shape.id]);
                    }
                    beginShapeResize(shape.id, event, resizeMode);
                    return;
                }

                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSelection(shape.id);
                    return;
                }

                if (event.shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    addToSelection(shape.id);
                    return;
                }

                if (!selectedShapeIds.has(shape.id)) {
                    setSelection([shape.id]);
                }

                if (target.closest('.node-section')) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                beginShapeDrag(shape.id, event);
            });

            div.addEventListener('mousemove', (event) => {
                if (interactionMode !== 'idle' || isSavingLayout) {
                    return;
                }
                const shapeState = shapeStateById.get(shape.id);
                const resizeMode = getResizeModeAtClientPoint(shapeState, event.clientX, event.clientY);
                div.style.cursor = getResizeCursorForMode(resizeMode);
            });

            div.addEventListener('mouseleave', () => {
                if (interactionMode !== 'idle') {
                    return;
                }
                div.style.cursor = 'move';
            });

            fo.appendChild(div);
            shapesGroup.appendChild(fo);
            shapeStateById.set(shape.id, {
                original: { x, y, width: w, height: h },
                current: { x, y, width: w, height: h },
                foreignObject: fo,
                node: div
            });
        }

        diagram.shapes.forEach(buildNodeContent);

        container.appendChild(svg);

        // Search Functionality
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        const searchCount = document.getElementById('search-count');
        const searchContainer = document.getElementById('search-container');
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.placeholder = 'Search entities...';
        searchInput.setAttribute('aria-label', 'Search diagram entities');
        searchInput.title = 'Enter: search/next, Shift+Enter: previous';
        searchButton.innerHTML = '<svg class="toolbar-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5" /></svg><span>Search</span>';

        const searchClearButton = document.createElement('button');
        searchClearButton.id = 'search-clear-button';
        searchClearButton.type = 'button';
        searchClearButton.title = 'Clear search';
        searchClearButton.innerHTML = '<svg class="toolbar-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" /></svg><span>Clear</span>';
        searchContainer.insertBefore(searchClearButton, searchCount);

        const searchNav = document.createElement('div');
        searchNav.id = 'search-nav';
        const searchPrevButton = document.createElement('button');
        searchPrevButton.id = 'search-prev-button';
        searchPrevButton.type = 'button';
        searchPrevButton.title = 'Previous match (Shift+Enter)';
        searchPrevButton.textContent = 'Prev';
        const searchNextButton = document.createElement('button');
        searchNextButton.id = 'search-next-button';
        searchNextButton.type = 'button';
        searchNextButton.title = 'Next match (Enter)';
        searchNextButton.textContent = 'Next';
        searchNav.appendChild(searchPrevButton);
        searchNav.appendChild(searchNextButton);
        searchContainer.insertBefore(searchNav, searchCount.nextSibling);

        const searchToViewSeparator = document.createElement('span');
        searchToViewSeparator.className = 'toolbar-separator';
        searchToViewSeparator.setAttribute('aria-hidden', 'true');
        searchContainer.appendChild(searchToViewSeparator);

        undoButton = document.createElement('button');
        undoButton.id = 'undo-button';
        undoButton.type = 'button';
        undoButton.setAttribute('aria-label', 'Undo layout change');
        undoButton.title = 'Undo (Cmd/Ctrl+Z)';
        undoButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5" /><path d="M20 20v-4a6 6 0 0 0-6-6H4" /></svg><span>Undo</span>';
        searchContainer.appendChild(undoButton);

        redoButton = document.createElement('button');
        redoButton.id = 'redo-button';
        redoButton.type = 'button';
        redoButton.setAttribute('aria-label', 'Redo layout change');
        redoButton.title = 'Redo (Shift+Cmd/Ctrl+Z or Ctrl+Y)';
        redoButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l5 5-5 5" /><path d="M4 20v-4a6 6 0 0 1 6-6h10" /></svg><span>Redo</span>';
        searchContainer.appendChild(redoButton);

        const editToViewSeparator = document.createElement('span');
        editToViewSeparator.className = 'toolbar-separator';
        editToViewSeparator.setAttribute('aria-hidden', 'true');
        searchContainer.appendChild(editToViewSeparator);

        // Add Reset Button
        const resetButton = document.createElement('button');
        resetButton.id = 'reset-button';
        resetButton.innerHTML = '<svg class="toolbar-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></svg><span>Reset</span>';
        searchContainer.appendChild(resetButton);

        toolModeButton = document.createElement('button');
        toolModeButton.id = 'tool-mode-button';
        toolModeButton.type = 'button';
        searchContainer.appendChild(toolModeButton);

        viewToStateSeparator = document.createElement('span');
        viewToStateSeparator.className = 'toolbar-separator';
        viewToStateSeparator.setAttribute('aria-hidden', 'true');
        searchContainer.appendChild(viewToStateSeparator);

        const dirtyIndicator = document.createElement('span');
        dirtyIndicator.id = 'layout-dirty-indicator';
        dirtyIndicator.textContent = 'Saved';
        searchContainer.appendChild(dirtyIndicator);

        const layoutToast = document.createElement('div');
        layoutToast.id = 'layout-toast';
        layoutToast.setAttribute('role', 'status');
        layoutToast.setAttribute('aria-live', 'polite');
        layoutToast.classList.add('hidden');
        document.body.appendChild(layoutToast);

        // Add Zoom Controls
        const zoomContainer = document.createElement('div');
        zoomContainer.id = 'zoom-container';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.className = 'zoom-btn';
        zoomInBtn.textContent = '+';
        zoomInBtn.title = 'Zoom In';

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className = 'zoom-btn';
        zoomOutBtn.textContent = '-';
        zoomOutBtn.title = 'Zoom Out';

        zoomContainer.appendChild(zoomInBtn);
        zoomContainer.appendChild(zoomOutBtn);
        document.getElementById('ui-layer').appendChild(zoomContainer);

        let currentMatchIndex = -1;
        let matches = [];
        let toastTimeoutId = null;
        let lastSearchToken = '';
        let hasPerformedSearch = false;

        function updateToolModeUi() {
            if (!toolModeButton) {
                return;
            }
            const isPanMode = canvasToolMode === 'pan';
            toolModeButton.dataset.mode = canvasToolMode;
            toolModeButton.innerHTML = isPanMode
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V5a1 1 0 0 1 2 0v6M10 11V4a1 1 0 1 1 2 0v7M13 11V5a1 1 0 0 1 2 0v6M16 12V7a1 1 0 0 1 2 0v8a5 5 0 0 1-5 5h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2h0.2" /></svg><span>Pan</span>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l13 7-6 2 2 7-3 1-2-7-4 4z" /></svg><span>Select</span>';
            toolModeButton.setAttribute('aria-label', isPanMode ? 'Pan tool' : 'Select tool');
            toolModeButton.title = isPanMode
                ? 'Pan mode: drag background to pan'
                : 'Select mode: drag background to box-select';
            updateCanvasCursor();
        }

        function updateLayoutDirtyUi() {
            const dirtyCount = dirtyChangesById.size;
            if (isSavingLayout) {
                dirtyIndicator.textContent = `Saving ${dirtyCount}...`;
                dirtyIndicator.classList.remove('muted');
                dirtyIndicator.classList.add('saving');
                updateStateSeparatorVisibility();
                updateHistoryUi();
                return;
            }

            if (dirtyCount === 0) {
                dirtyIndicator.textContent = 'Saved';
                dirtyIndicator.classList.add('muted');
                dirtyIndicator.classList.remove('saving');
            } else if (dirtyCount === 1) {
                dirtyIndicator.textContent = '1 unsaved';
                dirtyIndicator.classList.remove('muted');
                dirtyIndicator.classList.remove('saving');
            } else {
                dirtyIndicator.textContent = `${dirtyCount} unsaved`;
                dirtyIndicator.classList.remove('muted');
                dirtyIndicator.classList.remove('saving');
            }

            updateStateSeparatorVisibility();
            updateHistoryUi();
        }

        function showToast(message, isError) {
            if (!message) {
                return;
            }
            layoutToast.textContent = message;
            layoutToast.classList.toggle('error', Boolean(isError));
            layoutToast.classList.remove('hidden');
            layoutToast.classList.add('visible');

            if (toastTimeoutId) {
                clearTimeout(toastTimeoutId);
                toastTimeoutId = null;
            }

            toastTimeoutId = setTimeout(() => {
                layoutToast.classList.remove('visible');
                layoutToast.classList.add('hidden');
                layoutToast.classList.remove('error');
            }, 2200);
        }

        function commitDirtyStateAsSaved() {
            dirtyChangesById.clear();
            shapeStateById.forEach(shapeState => {
                shapeState.original = cloneBounds(shapeState.current);
                shapeState.node.classList.remove('layout-dirty');
            });
            connectorRenderRecords.forEach(record => {
                record.originalPoints = record.points.map(point => ({ x: point.x, y: point.y }));
            });
            updateLayoutDirtyUi();
        }

        function buildSavePayload() {
            const changes = [];
            dirtyChangesById.forEach((bounds, shapeId) => {
                changes.push({
                    shapeId,
                    x: toDiagramUnits(bounds.x),
                    y: toDiagramUnits(bounds.y),
                    width: toDiagramUnits(bounds.width),
                    height: toDiagramUnits(bounds.height)
                });
            });
            return changes;
        }

        function saveLayout() {
            if (isSavingLayout || dirtyChangesById.size === 0) return;

            if (interactionMode === 'selecting') {
                endSelectionInteraction();
            } else if (interactionMode !== 'idle') {
                endShapeInteraction();
            }

            const changes = buildSavePayload();
            if (!changes.length) {
                updateLayoutDirtyUi();
                return;
            }

            isSavingLayout = true;
            updateLayoutDirtyUi();

            vscode.postMessage({
                type: 'saveLayout',
                changes
            });
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || message.type !== 'saveLayoutResult') return;

            isSavingLayout = false;
            if (message.success) {
                commitDirtyStateAsSaved();
                showToast('Changes saved successfully.', false);
            } else {
                updateLayoutDirtyUi();
                showToast(message.message || 'Failed to save layout.', true);
            }
        });

        window.addEventListener('keydown', (event) => {
            const target = event.target;
            const isTextInput = target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable);

            if (!isTextInput && event.code === 'Space') {
                isSpacePressed = true;
                updateCanvasCursor();
                event.preventDefault();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveLayout();
                return;
            }

            if (!isTextInput && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    redoLayoutChange();
                } else {
                    undoLayoutChange();
                }
                return;
            }

            if (!isTextInput && event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                redoLayoutChange();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                searchInput.focus();
                searchInput.select();
                return;
            }

            if (!isTextInput && event.key === 'Escape') {
                if (selectionInteraction) {
                    endSelectionInteraction();
                }
                clearSelection();
            }
        });

        window.addEventListener('keyup', (event) => {
            if (event.code === 'Space') {
                isSpacePressed = false;
                updateCanvasCursor();
            }
        });

        updateLayoutDirtyUi();
        updateToolModeUi();
        updateHistoryUi();
        updateSelectionSummaryUi();
        updateSearchUiState('');

        function normalizeSearchToken(text) {
            return (text || '').trim().toLocaleLowerCase();
        }

        function clearSearchHighlights() {
            document.querySelectorAll('.node-container.search-match, .node-container.search-match-active, .node-container.highlight').forEach(node => {
                node.classList.remove('search-match');
                node.classList.remove('search-match-active');
                node.classList.remove('highlight');
            });
        }

        function updateSearchUiState(token) {
            const hasToken = token.length > 0;
            const hasMatches = matches.length > 0;

            searchClearButton.disabled = !hasToken;
            searchPrevButton.disabled = !hasMatches;
            searchNextButton.disabled = !hasMatches;

            if (!hasMatches || currentMatchIndex < 0) {
                searchCount.textContent = '0/0';
                return;
            }

            searchCount.textContent = `${currentMatchIndex + 1}/${matches.length}`;
        }

        function collectSearchMatches(token) {
            if (!token) {
                return [];
            }

            const found = [];
            const nodes = document.querySelectorAll('.node-container');
            nodes.forEach(node => {
                const header = node.querySelector('.node-header');
                const title = header ? header.textContent.trim().toLocaleLowerCase() : '';
                if (!title) {
                    return;
                }

                if (title.includes(token)) {
                    found.push(node);
                }
            });

            return found;
        }

        function applySearchHighlights() {
            clearSearchHighlights();
            if (!matches.length || currentMatchIndex < 0) {
                return;
            }

            matches.forEach(node => {
                node.classList.add('search-match');
            });

            const activeMatch = matches[currentMatchIndex];
            if (activeMatch) {
                activeMatch.classList.add('search-match-active');
                activeMatch.classList.add('highlight');
            }
        }

        function runSearch(options) {
            const config = options || {};
            const shouldFocus = Boolean(config.focusActive);
            const token = normalizeSearchToken(searchInput.value);

            if (!token) {
                clearSearch(true);
                return;
            }

            const queryChanged = token !== lastSearchToken;
            matches = collectSearchMatches(token);

            if (!matches.length) {
                currentMatchIndex = -1;
            } else if (queryChanged || currentMatchIndex < 0) {
                currentMatchIndex = 0;
            } else if (currentMatchIndex >= matches.length) {
                currentMatchIndex = matches.length - 1;
            }

            lastSearchToken = token;
            applySearchHighlights();
            updateSearchUiState(token);

            if (shouldFocus && currentMatchIndex >= 0) {
                zoomToNode(matches[currentMatchIndex]);
            }
        }

        function navigateSearch(step) {
            if (!matches.length || currentMatchIndex < 0) {
                return;
            }

            const total = matches.length;
            currentMatchIndex = (currentMatchIndex + step + total) % total;
            applySearchHighlights();
            updateSearchUiState(lastSearchToken);
            zoomToNode(matches[currentMatchIndex]);
        }

        function performSearch(step) {
            const direction = typeof step === 'number' && step < 0 ? -1 : 1;
            const token = normalizeSearchToken(searchInput.value);
            if (!token) {
                hasPerformedSearch = false;
                clearSearch();
                return;
            }

            hasPerformedSearch = true;
            if (token === lastSearchToken && matches.length > 0) {
                navigateSearch(direction);
                return;
            }

            runSearch({ focusActive: true });
        }

        function clearSearch(keepInputValue) {
            clearSearchHighlights();
            matches = [];
            currentMatchIndex = -1;
            lastSearchToken = '';
            hasPerformedSearch = false;

            if (!keepInputValue) {
                searchInput.value = '';
            }

            updateSearchUiState(normalizeSearchToken(searchInput.value));
        }

        function zoomToNode(node) {
            const x = parseFloat(node.dataset.x);
            const y = parseFloat(node.dataset.y);
            const w = parseFloat(node.dataset.w);
            const h = parseFloat(node.dataset.h);

            const padding = 50;
            const newX = x - padding;
            const newY = y - padding;
            const newW = w + (padding * 2);
            const newH = h + (padding * 2);

            currentViewBox = { x: newX, y: newY, width: newW, height: newH };
            svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
        }

        function resetView() {
            currentViewBox = { x: minX, y: minY, width: svgWidth, height: svgHeight };
            svg.setAttribute('viewBox', originalViewBox);
            updateScrollbars();
        }

        function manualZoom(factor) {
            const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat);
            const [x, y, w, h] = vb;

            const newW = w * factor;
            const newH = h * factor;

            // Center zoom
            const dx = (w - newW) / 2;
            const dy = (h - newH) / 2;

            const newX = x + dx;
            const newY = y + dy;

            currentViewBox = { x: newX, y: newY, width: newW, height: newH };
            svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
            updateScrollbars();
        }

        // Mouse Wheel Zoom
        svg.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (interactionMode !== 'idle') {
                    return;
                }
                e.preventDefault();

                const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

                // Zoom to mouse pointer
                const rect = svg.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                const vb = svg.getAttribute('viewBox').split(' ').map(parseFloat);
                const [vbX, vbY, vbW, vbH] = vb;

                // Mouse relative position (0-1)
                const rx = mx / rect.width;
                const ry = my / rect.height;

                // Mouse point in SVG space
                const px = vbX + (rx * vbW);
                const py = vbY + (ry * vbH);

                // New ViewBox dimensions
                const newW = vbW * zoomFactor;
                const newH = vbH * zoomFactor;

                // New ViewBox origin
                const newX = px - (rx * newW);
                const newY = py - (ry * newH);

                currentViewBox = { x: newX, y: newY, width: newW, height: newH };
                svg.setAttribute('viewBox', `${newX} ${newY} ${newW} ${newH}`);
                updateScrollbars();
            }
        });

        // Panning - direct viewBox manipulation for smooth interaction.
        svg.style.cursor = 'grab';

        let panStartViewBox = null;
        let panScale = 1;
        let panRafId = null;

        // Compute the uniform scale factor accounting for preserveAspectRatio="meet"
        function getPanScale(vb) {
            const rect = svg.getBoundingClientRect();
            const scaleX = vb.width / rect.width;
            const scaleY = vb.height / rect.height;
            return Math.max(scaleX, scaleY);
        }

        function shouldPanBackgroundOnPointerDown(event) {
            if (event.button === 1) {
                return true;
            }
            if (event.button !== 0) {
                return false;
            }
            if (isSpacePressed) {
                return true;
            }
            return canvasToolMode === 'pan';
        }

        function updateCanvasCursor() {
            if (isPanning) {
                svg.style.cursor = 'grabbing';
                return;
            }
            if (interactionMode !== 'idle') {
                return;
            }
            const panActive = canvasToolMode === 'pan' || isSpacePressed;
            svg.style.cursor = panActive ? 'grab' : 'crosshair';
        }

        svg.addEventListener('mousedown', (e) => {
            if (interactionMode !== 'idle') {
                return;
            }

            const target = e.target;
            if (target instanceof Element && target.closest('.node-container')) {
                return;
            }

            const shouldPan = shouldPanBackgroundOnPointerDown(e);
            if (shouldPan) {
                isPanning = true;
                startPoint = { x: e.clientX, y: e.clientY };
                panStartViewBox = { ...currentViewBox };
                panScale = getPanScale(panStartViewBox);
                svg.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }

            if (e.button === 0) {
                startSelectionInteraction(e, e.shiftKey || e.ctrlKey || e.metaKey);
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;

            const dx = e.clientX - startPoint.x;
            const dy = e.clientY - startPoint.y;

            const newX = panStartViewBox.x - (dx * panScale);
            const newY = panStartViewBox.y - (dy * panScale);

            currentViewBox.x = newX;
            currentViewBox.y = newY;
            clampViewBox(currentViewBox);

            if (panRafId) cancelAnimationFrame(panRafId);
            panRafId = requestAnimationFrame(() => {
                svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${panStartViewBox.width} ${panStartViewBox.height}`);
                updateScrollbars();
                panRafId = null;
            });
        });

        window.addEventListener('mousemove', (event) => {
            if (interactionMode !== 'selecting') {
                return;
            }
            event.preventDefault();
            updateSelectionInteraction(event);
        });

        function stopPan() {
            if (isPanning) {
                isPanning = false;
            }
            if (activeShapeInteraction) {
                endShapeInteraction();
            }
            if (selectionInteraction) {
                endSelectionInteraction();
            }
            if (scrollDrag) {
                scrollDrag = null;
                document.body.style.userSelect = '';
                updateScrollbars();
            }
            updateCanvasCursor();
        }

        window.addEventListener('mouseup', stopPan);
        document.addEventListener('mouseleave', stopPan);
        window.addEventListener('blur', stopPan);

        // Wheel scroll (without Ctrl/Cmd) to pan the diagram
        svg.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                if (interactionMode !== 'idle') {
                    return;
                }
                e.preventDefault();
                const sc = getPanScale(currentViewBox);
                currentViewBox.x += e.deltaX * sc;
                currentViewBox.y += e.deltaY * sc;
                clampViewBox(currentViewBox);
                svg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
                updateScrollbars();
            }
        }, { passive: false });

        searchButton.addEventListener('click', performSearch);
        undoButton.addEventListener('click', undoLayoutChange);
        redoButton.addEventListener('click', redoLayoutChange);
        resetButton.addEventListener('click', resetView);
        toolModeButton.addEventListener('click', () => {
            if (isSavingLayout || interactionMode !== 'idle') {
                return;
            }
            canvasToolMode = canvasToolMode === 'pan' ? 'select' : 'pan';
            updateToolModeUi();
        });
        searchPrevButton.addEventListener('click', () => navigateSearch(-1));
        searchNextButton.addEventListener('click', () => navigateSearch(1));
        searchClearButton.addEventListener('click', () => {
            hasPerformedSearch = false;
            clearSearch();
            searchInput.focus();
        });
        searchInput.addEventListener('input', () => {
            const token = normalizeSearchToken(searchInput.value);
            if (!token) {
                hasPerformedSearch = false;
                clearSearch(true);
                return;
            }

            if (token !== lastSearchToken) {
                hasPerformedSearch = false;
                clearSearchHighlights();
                matches = [];
                currentMatchIndex = -1;
                updateSearchUiState(token);
            }
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                performSearch(event.shiftKey ? -1 : 1);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                clearSearch();
                resetView();
            }
        });

        zoomInBtn.addEventListener('click', () => manualZoom(0.8)); // Zoom in (smaller viewbox)
        zoomOutBtn.addEventListener('click', () => manualZoom(1.25)); // Zoom out (larger viewbox)

        // Alias Hover Tooltip - Event Delegation
        let tooltip = null;
        let currentAliasNode = null;

        container.addEventListener('mousemove', (e) => {
            if (interactionMode !== 'idle') {
                if (currentAliasNode) {
                    currentAliasNode = null;
                    hideTooltip();
                }
                return;
            }

            const node = e.target.closest('.alias-node');

            if (node) {
                if (currentAliasNode !== node) {
                    currentAliasNode = node;
                    const header = node.querySelector('.node-header');
                    const dcName = header ? header.textContent : '';
                    const alias = aliases.find(a => a.dcName === dcName);

                    if (alias && alias.dcId) {
                        const entity = entities.find(e => e.id === alias.dcId);
                        if (entity) {
                            showTooltip(e, entity);
                        }
                    }
                }
                moveTooltip(e);
            } else {
                if (currentAliasNode) {
                    currentAliasNode = null;
                    hideTooltip();
                }
            }
        });

        container.addEventListener('mouseleave', () => {
            if (currentAliasNode) {
                currentAliasNode = null;
                hideTooltip();
            }
        });

        function showTooltip(e, entity) {
            if (tooltip) document.body.removeChild(tooltip);

            tooltip = document.createElement('div');
            tooltip.className = 'alias-tooltip';

            // Header
            const header = document.createElement('div');
            header.className = 'node-header';
            header.textContent = entity.name;
            tooltip.appendChild(header);

            // Properties - Show ALL properties
            if (entity.properties && entity.properties.length > 0) {
                const section = document.createElement('div');
                section.className = 'node-section alias-properties-section';

                // Show ALL properties (no limit)
                entity.properties.forEach(prop => {
                    const item = document.createElement('div');
                    item.className = 'node-item';

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'property-name';
                    nameSpan.textContent = prop.name;

                    const typeSpan = document.createElement('span');
                    typeSpan.className = 'property-type';
                    typeSpan.textContent = prop.type;

                    item.appendChild(nameSpan);
                    item.appendChild(typeSpan);
                    section.appendChild(item);
                });

                tooltip.appendChild(section);
            }

            // Navigation Properties
            if (entity.navigationProperties && entity.navigationProperties.length > 0) {
                const navSection = document.createElement('div');
                navSection.className = 'node-section navigation-section';

                entity.navigationProperties.forEach(navProp => {
                    const item = document.createElement('div');
                    item.className = 'node-item navigation-item';
                    item.textContent = navProp;
                    navSection.appendChild(item);
                });

                tooltip.appendChild(navSection);
            }

            document.body.appendChild(tooltip);
            moveTooltip(e);
        }

        function hideTooltip() {
            if (tooltip) {
                document.body.removeChild(tooltip);
                tooltip = null;
            }
        }

        function moveTooltip(e) {
            if (!tooltip) return;

            const x = e.clientX + 15;
            const y = e.clientY + 15;

            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }

        // Diagram editing currently supports shape move/resize and explicit layout save only.
    } catch (e) {
        const container = document.getElementById('diagram-container');
        if (container) {
            container.innerHTML = `<div style="color:red; padding:20px;">
                <h3>Error in fwbo.js</h3>
                <pre>${e.toString()}</pre>
                <pre>${e.stack}</pre>
            </div>`;
        }
        console.error(e);
    }
}());
