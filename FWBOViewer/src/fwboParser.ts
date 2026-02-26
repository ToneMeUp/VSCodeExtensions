import { XMLParser } from 'fast-xml-parser';

export interface FwboData {
    entities: Entity[];
    services: Service[];
    associations: Association[];
    aliases: Alias[];
    diagram: Diagram;
}

export interface Entity {
    id: string;
    name: string;
    properties: Property[];
    navigationProperties: string[];
}

export interface Service {
    id: string;
    name: string;
    operations: Operation[];
}

export interface Operation {
    id: string;
    name: string;
    returnDcId: string;
    requestDcId: string;
}

export interface Alias {
    id: string;
    dcName: string;
    dcId: string;
}

export interface Property {
    name: string;
    type: string;
}

export interface Association {
    id: string;
    name: string;
    sourceMultiplicity?: string;
    targetMultiplicity?: string;
}

export interface Diagram {
    shapes: Shape[];
    connectors: Connector[];
}

export interface Shape {
    id: string;
    modelId: string; // ID of the entity or service
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'entity' | 'service' | 'alias';
    outlineColor?: string;
}

export interface Connector {
    id: string;
    associationId: string;
    points: Point[];
}

export interface Point {
    x: number;
    y: number;
}

export class FwboParser {
    private parser: XMLParser;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
    }

    public parse(fwboXml: string, diagramXml: string): FwboData {
        const fwboObj = this.parser.parse(fwboXml);
        const diagramObj = diagramXml ? this.parser.parse(diagramXml) : null;

        const entities: Entity[] = [];
        const services: Service[] = [];
        const associations: Association[] = [];
        const aliases: Alias[] = [];

        const modelRoot = fwboObj.modelRoot;

        // Parse Aliases
        if (modelRoot.modelTypeList && modelRoot.modelTypeList.dcAlias) {
            const aliasList = Array.isArray(modelRoot.modelTypeList.dcAlias)
                ? modelRoot.modelTypeList.dcAlias
                : [modelRoot.modelTypeList.dcAlias];

            for (const a of aliasList) {
                aliases.push({
                    id: a['@_Id'],
                    dcName: a['@_dcName'],
                    dcId: a['@_dcId']
                });
            }
        }

        // Parse Services
        if (modelRoot.modelTypeList && modelRoot.modelTypeList.service) {
            const serviceList = Array.isArray(modelRoot.modelTypeList.service)
                ? modelRoot.modelTypeList.service
                : [modelRoot.modelTypeList.service];

            for (const s of serviceList) {
                const operations: Operation[] = [];
                if (s.propertyOperationList && s.propertyOperationList.serviceHasPropertyOperationList) {
                    const opListWrapper = Array.isArray(s.propertyOperationList.serviceHasPropertyOperationList)
                        ? s.propertyOperationList.serviceHasPropertyOperationList
                        : [s.propertyOperationList.serviceHasPropertyOperationList];

                    for (const wrapper of opListWrapper) {
                        if (wrapper.propertyOperation) {
                            const ops = Array.isArray(wrapper.propertyOperation)
                                ? wrapper.propertyOperation
                                : [wrapper.propertyOperation];
                            for (const op of ops) {
                                operations.push({
                                    id: op['@_Id'],
                                    name: op['@_name'],
                                    returnDcId: op['@_returnDcId'],
                                    requestDcId: op['@_requestDcId']
                                });
                            }
                        }
                    }
                }

                services.push({
                    id: s['@_Id'],
                    name: s['@_name'],
                    operations: operations
                });
            }
        }

        // Parse DCs (Entities)
        // DCs are children of modelTypeList
        if (modelRoot.modelTypeList && modelRoot.modelTypeList.dc) {
            const dcList = Array.isArray(modelRoot.modelTypeList.dc) ? modelRoot.modelTypeList.dc : [modelRoot.modelTypeList.dc];
            for (const d of dcList) {
                const props: Property[] = [];
                if (d.propertyDcList && d.propertyDcList.dcBaseHasPropertyDcList) {
                    const propListWrapper = Array.isArray(d.propertyDcList.dcBaseHasPropertyDcList)
                        ? d.propertyDcList.dcBaseHasPropertyDcList
                        : [d.propertyDcList.dcBaseHasPropertyDcList];

                    for (const wrapper of propListWrapper) {
                        if (wrapper.propertyDc) {
                            props.push({
                                name: wrapper.propertyDc['@_name'],
                                type: wrapper.propertyDc['@_type'] || 'String'
                            });
                        }
                    }
                }

                const navProps: string[] = [];
                // Parse Associations inside DC (treat as navigation properties)
                if (d.associationDcList && d.associationDcList.associationDc) {
                    const assocListWrapper = Array.isArray(d.associationDcList.associationDc)
                        ? d.associationDcList.associationDc
                        : [d.associationDcList.associationDc];

                    for (const a of assocListWrapper) {
                        // Extract clean target name from association name
                        // e.g., "GetHubSalesOrderResponseSalesOrder" -> "SalesOrder"
                        const fullName = a['@_name'];
                        const sourceName = d['@_name'];
                        // Remove source name prefix to get target name
                        const cleanName = fullName.startsWith(sourceName)
                            ? fullName.substring(sourceName.length)
                            : fullName;

                        navProps.push(cleanName);
                        associations.push({
                            id: a['@_Id'],
                            name: a['@_name'],
                            sourceMultiplicity: a['@_sourceMultiplicityAlias'],
                            targetMultiplicity: a['@_targetMultiplicityAlias']
                        });
                    }
                }

                entities.push({
                    id: d['@_Id'],
                    name: d['@_name'],
                    properties: props,
                    navigationProperties: navProps
                });
            }
        }

        // Parse Entities (DB Schema)
        if (modelRoot.modelTypeList && modelRoot.modelTypeList.entity) {
            const entityList = Array.isArray(modelRoot.modelTypeList.entity) ? modelRoot.modelTypeList.entity : [modelRoot.modelTypeList.entity];
            for (const e of entityList) {
                const props: Property[] = [];
                if (e.propertyList && e.propertyList.entityHasProperties) {
                    const propListWrapper = Array.isArray(e.propertyList.entityHasProperties)
                        ? e.propertyList.entityHasProperties
                        : [e.propertyList.entityHasProperties];

                    for (const wrapper of propListWrapper) {
                        if (wrapper.property) {
                            props.push({
                                name: wrapper.property['@_name'],
                                type: wrapper.property['@_type'] || 'String'
                            });
                        }
                    }
                }

                const navProps: string[] = [];
                // Parse Navigation Properties
                if (e.navigationPropertyList && e.navigationPropertyList.entityHasNavigationPropertyList) {
                    const navListWrapper = Array.isArray(e.navigationPropertyList.entityHasNavigationPropertyList)
                        ? e.navigationPropertyList.entityHasNavigationPropertyList
                        : [e.navigationPropertyList.entityHasNavigationPropertyList];

                    for (const wrapper of navListWrapper) {
                        if (wrapper.navigationProperty) {
                            // Extract clean target name
                            const fullName = wrapper.navigationProperty['@_name'];
                            const sourceName = e['@_name'];
                            // Remove source name prefix to get clean target name
                            const cleanName = fullName.startsWith(sourceName)
                                ? fullName.substring(sourceName.length)
                                : fullName;

                            navProps.push(cleanName);
                        }
                    }
                }

                // Parse Associations inside Entity
                if (e.associationList && e.associationList.association) {
                    const assocListWrapper = Array.isArray(e.associationList.association)
                        ? e.associationList.association
                        : [e.associationList.association];

                    for (const a of assocListWrapper) {
                        associations.push({
                            id: a['@_Id'],
                            name: a['@_name'],
                            sourceMultiplicity: a['@_sourceMultiplicityAlias'],
                            targetMultiplicity: a['@_targetMultiplicityAlias']
                        });
                    }
                }

                entities.push({
                    id: e['@_Id'],
                    name: e['@_name'],
                    properties: props,
                    navigationProperties: navProps
                });
            }
        }

        // Parse Diagram
        const diagram: Diagram = { shapes: [], connectors: [] };
        if (diagramObj && diagramObj.Frameworks2022Diagram && diagramObj.Frameworks2022Diagram.nestedChildShapes) {
            const shapes = diagramObj.Frameworks2022Diagram.nestedChildShapes;

            // Entity Shapes
            if (shapes.entityDcShape) {
                const entityShapes = Array.isArray(shapes.entityDcShape) ? shapes.entityDcShape : [shapes.entityDcShape];
                for (const s of entityShapes) {
                    const bounds = this.parseBounds(s['@_absoluteBounds']);
                    diagram.shapes.push({
                        id: s['@_Id'],
                        modelId: s.dcMoniker ? s.dcMoniker['@_Id'] : '',
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                        type: 'entity',
                        outlineColor: s['@_outlineColor']
                    });
                }
            }

            // Service Shapes
            if (shapes.serviceShape) {
                const serviceShapes = Array.isArray(shapes.serviceShape) ? shapes.serviceShape : [shapes.serviceShape];
                for (const s of serviceShapes) {
                    const bounds = this.parseBounds(s['@_absoluteBounds']);
                    diagram.shapes.push({
                        id: s['@_Id'],
                        modelId: s.serviceMoniker ? s.serviceMoniker['@_Id'] : '',
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                        type: 'service',
                        outlineColor: s['@_outlineColor']
                    });
                }
            }

            // Alias Shapes
            if (shapes.dcAliasShape) {
                const aliasShapes = Array.isArray(shapes.dcAliasShape) ? shapes.dcAliasShape : [shapes.dcAliasShape];
                for (const s of aliasShapes) {
                    const bounds = this.parseBounds(s['@_absoluteBounds']);
                    diagram.shapes.push({
                        id: s['@_Id'],
                        modelId: s.dcAliasMoniker ? s.dcAliasMoniker['@_Id'] : '',
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                        type: 'alias',
                        outlineColor: s['@_outlineColor']
                    });
                }
            }

            // Entity Shapes (DB Schema)
            if (shapes.entityShape) {
                const entityShapes = Array.isArray(shapes.entityShape) ? shapes.entityShape : [shapes.entityShape];
                for (const s of entityShapes) {
                    const bounds = this.parseBounds(s['@_absoluteBounds']);
                    diagram.shapes.push({
                        id: s['@_Id'],
                        modelId: s.entityMoniker ? s.entityMoniker['@_Id'] : '',
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                        type: 'entity',
                        outlineColor: s['@_outlineColor']
                    });
                }
            }

            // Connectors
            if (shapes.associationConnector) {
                const connectors = Array.isArray(shapes.associationConnector) ? shapes.associationConnector : [shapes.associationConnector];
                for (const c of connectors) {
                    const points = this.parseEdgePoints(c['@_edgePoints']);
                    diagram.connectors.push({
                        id: c['@_Id'],
                        associationId: c.associationDcMoniker ? c.associationDcMoniker['@_Id'] : (c.associationMoniker ? c.associationMoniker['@_Id'] : ''),
                        points: points
                    });
                }
            }
        }

        return { entities, services, associations, aliases, diagram };
    }

    private parseBounds(boundsStr: string): { x: number, y: number, width: number, height: number } {
        if (!boundsStr) return { x: 0, y: 0, width: 0, height: 0 };
        const parts = boundsStr.split(',').map(s => parseFloat(s.trim()));
        if (parts.length >= 4) {
            return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
        }
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    private parseEdgePoints(pointsStr: string): Point[] {
        // Format: [(x1 : y1); (x2 : y2); ...]
        if (!pointsStr) return [];
        const points: Point[] = [];
        const regex = /\(([\d\.]+)\s*:\s*([\d\.]+)\)/g;
        let match;
        while ((match = regex.exec(pointsStr)) !== null) {
            points.push({
                x: parseFloat(match[1]),
                y: parseFloat(match[2])
            });
        }
        return points;
    }
}
