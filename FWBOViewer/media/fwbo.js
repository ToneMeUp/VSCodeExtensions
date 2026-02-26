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

        // Add some padding
        const padding = 40;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const svgWidth = maxX - minX;
        const svgHeight = maxY - minY;
        const originalViewBox = `${minX} ${minY} ${svgWidth} ${svgHeight}`;
        const originalViewBoxW = svgWidth;
        const originalViewBoxH = svgHeight;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', originalViewBox);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        const connectorsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(connectorsGroup);

        let currentViewBox = { x: minX, y: minY, width: svgWidth, height: svgHeight };
        
        // Render connectors once (read-only, no updates needed)
        diagram.connectors.forEach(conn => {
            const association = associationMap.get(conn.associationId);
            const points = conn.points.map(p => ({ x: p.x * scale, y: p.y * scale }));

            const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points', pointsStr);
            polyline.setAttribute('class', 'connector');
            connectorsGroup.appendChild(polyline);

            if (association && points.length >= 2) {
                const startPoint = points[0];
                const endPoint = points[points.length - 1];

                if (association.sourceMultiplicity) {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    const p2 = points[1];
                    let dx = 10, dy = -5;
                    if (Math.abs(p2.x - startPoint.x) < Math.abs(p2.y - startPoint.y)) {
                        dx = 5;
                        dy = (p2.y > startPoint.y) ? 15 : -5;
                    } else {
                        dx = (p2.x > startPoint.x) ? 10 : -10;
                    }
                    text.setAttribute('x', startPoint.x + dx);
                    text.setAttribute('y', startPoint.y + dy);
                    text.setAttribute('class', 'cardinality-label');
                    text.textContent = association.sourceMultiplicity;
                    connectorsGroup.appendChild(text);
                }

                if (association.targetMultiplicity) {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    const pPrev = points[points.length - 2];
                    let dx = -10, dy = -5;
                    if (Math.abs(endPoint.x - pPrev.x) < Math.abs(endPoint.y - pPrev.y)) {
                        dx = 5;
                        dy = (endPoint.y > pPrev.y) ? -5 : 15;
                    } else {
                        dx = (endPoint.x > pPrev.x) ? -10 : 10;
                    }
                    text.setAttribute('x', endPoint.x + dx);
                    text.setAttribute('y', endPoint.y + dy);
                    text.setAttribute('class', 'cardinality-label');
                    text.setAttribute('text-anchor', 'middle');
                    text.textContent = association.targetMultiplicity;
                    connectorsGroup.appendChild(text);
                }
            }
        });

        const shapesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        shapesGroup.style.willChange = 'transform';
        svg.appendChild(shapesGroup);

        const nodeElements = new Map();

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

            if (shape.outlineColor) {
                div.style.borderColor = shape.outlineColor;
                div.style.boxShadow = `0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 1px ${shape.outlineColor}`;
            }

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

                    // Read-only viewer - no context menu
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
                        const opsHtml = service.operations.slice(0, 10).map(op => 
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

            fo.appendChild(div);
            shapesGroup.appendChild(fo);
            nodeElements.set(shape.id, fo);
        }

        diagram.shapes.forEach(buildNodeContent);

        container.appendChild(svg);

        svg.style.willChange = 'viewBox';

        // Search Functionality
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        const searchCount = document.getElementById('search-count');

        // Add Reset Button
        const resetButton = document.createElement('button');
        resetButton.id = 'reset-button';
        resetButton.textContent = 'Reset View';
        document.getElementById('search-container').appendChild(resetButton);

        // READ-ONLY VIEWER - No add entity button

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

        let currentMatchIndex = 0;
        let matches = [];

        function performSearch() {
            const query = searchInput.value.trim();

            // Clear previous highlights
            document.querySelectorAll('.node-container.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
            matches = [];
            currentMatchIndex = 0;
            searchCount.textContent = '';

            if (!query) {
                resetView();
                return;
            }

            // Find matches - exact match, entities only (exclude aliases)
            const nodes = document.querySelectorAll('.node-container');
            nodes.forEach(node => {
                // Skip alias nodes
                if (node.classList.contains('alias-node')) {
                    return;
                }

                const header = node.querySelector('.node-header');
                if (header && header.textContent.trim().toLowerCase() === query.toLowerCase()) {
                    matches.push(node);
                }
            });

            if (matches.length > 0) {
                searchCount.textContent = `${matches.length} found`;
                highlightMatch(0);
            } else {
                searchCount.textContent = '0 found';
                resetView();
            }
        }

        function highlightMatch(index) {
            if (index >= matches.length) index = 0;
            if (index < 0) index = matches.length - 1;
            currentMatchIndex = index;

            // Clear all highlights first
            matches.forEach(m => m.classList.remove('highlight'));

            // Highlight only the current match
            const match = matches[currentMatchIndex];
            match.classList.add('highlight');

            // Zoom to the match
            zoomToNode(match);
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
            document.querySelectorAll('.node-container.highlight').forEach(el => {
                el.classList.remove('highlight');
            });
            searchInput.value = '';
            searchCount.textContent = '';
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
        }

        // Mouse Wheel Zoom
        svg.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                const zoomIntensity = 0.1;
                const delta = e.deltaY > 0 ? 1 : -1;
                const factor = 1 + (delta * zoomIntensity); // > 1 zooms out, < 1 zooms in?
                // Actually: deltaY > 0 is scroll down (zoom out usually), deltaY < 0 is scroll up (zoom in)
                // Let's align: Scroll Up (negative delta) -> Zoom In (factor < 1)
                // Scroll Down (positive delta) -> Zoom Out (factor > 1)

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
            }
        });

        // READ-ONLY PANNING - Ultra-smooth performance using direct viewBox manipulation
        svg.style.cursor = 'grab';

        let panStartViewBox = null;

        svg.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                isPanning = true;
                startPoint = { x: e.clientX, y: e.clientY };
                panStartViewBox = { ...currentViewBox };
                svg.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;

            const dx = e.clientX - startPoint.x;
            const dy = e.clientY - startPoint.y;

            // Direct viewBox manipulation - no DOM transform, ultra-smooth
            const rect = svg.getBoundingClientRect();
            const scaleX = panStartViewBox.width / rect.width;
            const scaleY = panStartViewBox.height / rect.height;

            const newX = panStartViewBox.x - (dx * scaleX);
            const newY = panStartViewBox.y - (dy * scaleY);

            requestAnimationFrame(() => {
                svg.setAttribute('viewBox', `${newX} ${newY} ${panStartViewBox.width} ${panStartViewBox.height}`);
            });
        });

        window.addEventListener('mouseup', (e) => {
            if (isPanning) {
                const dx = e.clientX - startPoint.x;
                const dy = e.clientY - startPoint.y;

                const rect = svg.getBoundingClientRect();
                const scaleX = panStartViewBox.width / rect.width;
                const scaleY = panStartViewBox.height / rect.height;

                const newX = panStartViewBox.x - (dx * scaleX);
                const newY = panStartViewBox.y - (dy * scaleY);

                currentViewBox = { x: newX, y: newY, width: panStartViewBox.width, height: panStartViewBox.height };

                isPanning = false;
                svg.style.cursor = 'grab';
            }
        });

        searchButton.addEventListener('click', performSearch);
        resetButton.addEventListener('click', resetView);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        zoomInBtn.addEventListener('click', () => manualZoom(0.8)); // Zoom in (smaller viewbox)
        zoomOutBtn.addEventListener('click', () => manualZoom(1.25)); // Zoom out (larger viewbox)

        // Alias Hover Tooltip - Event Delegation
        let tooltip = null;
        let currentAliasNode = null;

        container.addEventListener('mousemove', (e) => {
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

        // READ-ONLY VIEWER - No context menu, no editing features
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
