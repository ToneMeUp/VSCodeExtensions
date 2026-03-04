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
        let selectionIndicator = null;
        let viewToStateSeparator = null;

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
                selectionIndicator.textContent = '';
                selectionIndicator.classList.remove('active');
                selectionIndicator.classList.add('is-hidden');
            } else if (selectedCount === 1) {
                selectionIndicator.textContent = '1 selected';
                selectionIndicator.classList.add('active');
                selectionIndicator.classList.remove('is-hidden');
            } else {
                selectionIndicator.textContent = `${selectedCount} selected`;
                selectionIndicator.classList.add('active');
                selectionIndicator.classList.remove('is-hidden');
            }

            updateStateSeparatorVisibility();
        }

        function updateStateSeparatorVisibility() {
            if (!viewToStateSeparator) {
                return;
            }

            const showStateGroupDivider = isSavingLayout || dirtyChangesById.size > 0 || selectedShapeIds.size > 0;
            viewToStateSeparator.classList.toggle('is-hidden', !showStateGroupDivider);
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
                pendingInteractionUpdate = {
                    updates: [{
                        shapeId: activeShapeInteraction.shapeId,
                        bounds: {
                            x: startBounds.x,
                            y: startBounds.y,
                            width: Math.max(minShapeWidth, startBounds.width + dx),
                            height: Math.max(minShapeHeight, startBounds.height + dy)
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

        function createMultiplicityLabel(textContent, textAnchor) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'cardinality-label');
            if (textAnchor) {
                text.setAttribute('text-anchor', textAnchor);
            }
            text.textContent = textContent;
            connectorsGroup.appendChild(text);
            return text;
        }

        function updateSourceLabelPosition(label, points) {
            if (points.length < 2) return;
            const startPoint = points[0];
            const nextPoint = points[1];
            let dx = 10;
            let dy = -5;

            if (Math.abs(nextPoint.x - startPoint.x) < Math.abs(nextPoint.y - startPoint.y)) {
                dx = 5;
                dy = (nextPoint.y > startPoint.y) ? 15 : -5;
            } else {
                dx = (nextPoint.x > startPoint.x) ? 10 : -10;
            }

            label.setAttribute('x', String(startPoint.x + dx));
            label.setAttribute('y', String(startPoint.y + dy));
        }

        function updateTargetLabelPosition(label, points) {
            if (points.length < 2) return;
            const endPoint = points[points.length - 1];
            const prevPoint = points[points.length - 2];
            let dx = -10;
            let dy = -5;

            if (Math.abs(endPoint.x - prevPoint.x) < Math.abs(endPoint.y - prevPoint.y)) {
                dx = 5;
                dy = (endPoint.y > prevPoint.y) ? -5 : 15;
            } else {
                dx = (endPoint.x > prevPoint.x) ? -10 : 10;
            }

            label.setAttribute('x', String(endPoint.x + dx));
            label.setAttribute('y', String(endPoint.y + dy));
        }

        function applyConnectorGeometry(record, nextPoints) {
            record.points = nextPoints.map(point => ({ x: point.x, y: point.y }));
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

        function recomputeConnectorPoints(record) {
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
        }

        function beginShapeResize(shapeId, event) {
            if (interactionMode !== 'idle' || isSavingLayout) return;
            const shapeState = shapeStateById.get(shapeId);
            if (!shapeState) return;

            const pointerPoint = getSvgPointFromClient(event.clientX, event.clientY);
            if (!pointerPoint) return;

            interactionMode = 'resizing';
            activeShapeInteraction = {
                shapeId,
                startPointer: pointerPoint,
                startBounds: cloneBounds(shapeState.current)
            };

            shapeState.node.classList.add('layout-interacting');
            document.body.style.userSelect = 'none';
        }

        function endShapeInteraction() {
            if (!activeShapeInteraction) return;

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
            });

            activeShapeInteraction = null;
            interactionMode = 'idle';
            document.body.style.userSelect = '';
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

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.title = 'Resize';
            div.appendChild(resizeHandle);

            div.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                const target = event.target;
                if (!(target instanceof Element)) return;

                if (target.closest('.resize-handle')) {
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

            resizeHandle.addEventListener('mousedown', (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                if (!selectedShapeIds.has(shape.id) || selectedShapeIds.size !== 1) {
                    setSelection([shape.id]);
                }
                beginShapeResize(shape.id, event);
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
        searchCount.classList.add('is-hidden');
        searchNav.classList.add('is-hidden');

        const searchToViewSeparator = document.createElement('span');
        searchToViewSeparator.className = 'toolbar-separator';
        searchToViewSeparator.setAttribute('aria-hidden', 'true');
        searchContainer.appendChild(searchToViewSeparator);

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

        selectionIndicator = document.createElement('span');
        selectionIndicator.id = 'selection-indicator';
        selectionIndicator.textContent = '';
        searchContainer.appendChild(selectionIndicator);

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
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V5a1 1 0 0 1 2 0v6M10 11V4a1 1 0 1 1 2 0v7M13 11V5a1 1 0 0 1 2 0v6M16 12V7a1 1 0 0 1 2 0v8a5 5 0 0 1-5 5h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2h0.2" /></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l13 7-6 2 2 7-3 1-2-7-4 4z" /></svg>';
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
                dirtyIndicator.classList.remove('is-hidden');
                updateStateSeparatorVisibility();
                return;
            }

            if (dirtyCount === 0) {
                dirtyIndicator.textContent = '';
                dirtyIndicator.classList.add('is-hidden');
            } else if (dirtyCount === 1) {
                dirtyIndicator.textContent = '1 unsaved';
                dirtyIndicator.classList.remove('is-hidden');
            } else {
                dirtyIndicator.textContent = `${dirtyCount} unsaved`;
                dirtyIndicator.classList.remove('is-hidden');
            }

            updateStateSeparatorVisibility();
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
            const showSearchMeta = hasPerformedSearch && hasToken;

            searchCount.classList.toggle('is-hidden', !showSearchMeta);
            searchNav.classList.toggle('is-hidden', !showSearchMeta);

            searchClearButton.disabled = !hasToken;
            searchPrevButton.disabled = !showSearchMeta || !hasMatches;
            searchNextButton.disabled = !showSearchMeta || !hasMatches;

            if (!showSearchMeta) {
                searchCount.textContent = '';
                return;
            }

            if (!hasMatches) {
                searchCount.textContent = '0 found';
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
