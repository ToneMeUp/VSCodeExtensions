import { IFwboDataProvider } from './IFwboDataProvider';
import { FwboData, Entity, Service, Association, Alias, Diagram } from './fwboParser';

/**
 * JSON-based FWBO data provider (FUTURE IMPLEMENTATION).
 * Will parse JSON-formatted FWBO files into FwboData.
 *
 * Expected JSON structure:
 * {
 *   "entities": [...],
 *   "services": [...],
 *   "associations": [...],
 *   "aliases": [...],
 *   "diagram": {
 *     "shapes": [...],
 *     "connectors": [...]
 *   }
 * }
 */
export class JsonFwboDataProvider implements IFwboDataProvider {
    /**
     * Parse JSON-based FWBO model and diagram data.
     * @param modelContent JSON content from .fwbo.json file
     * @param diagramContent Optional JSON diagram content (can be embedded in model)
     * @returns Parsed FwboData structure
     */
    public parse(modelContent: string, diagramContent?: string): FwboData {
        try {
            const modelJson = JSON.parse(modelContent);

            // If the JSON already matches FwboData structure, return it directly
            if (this.isValidFwboData(modelJson)) {
                return modelJson as FwboData;
            }

            // Otherwise, transform from custom JSON format to FwboData
            return this.transformToFwboData(modelJson, diagramContent);
        } catch (error) {
            throw new Error(`Failed to parse JSON FWBO data: ${error}`);
        }
    }

    /**
     * Check if JSON object matches FwboData interface structure.
     */
    private isValidFwboData(obj: any): boolean {
        return obj &&
            Array.isArray(obj.entities) &&
            Array.isArray(obj.services) &&
            Array.isArray(obj.associations) &&
            Array.isArray(obj.aliases) &&
            obj.diagram &&
            Array.isArray(obj.diagram.shapes) &&
            Array.isArray(obj.diagram.connectors);
    }

    /**
     * Transform custom JSON format to FwboData structure.
     * TODO: Implement based on actual JSON schema when available.
     */
    private transformToFwboData(modelJson: any, diagramContent?: string): FwboData {
        // Placeholder implementation
        // When JSON format is defined, implement transformation logic here

        const entities: Entity[] = modelJson.entities || [];
        const services: Service[] = modelJson.services || [];
        const associations: Association[] = modelJson.associations || [];
        const aliases: Alias[] = modelJson.aliases || [];

        let diagram: Diagram = { shapes: [], connectors: [] };
        if (diagramContent) {
            const diagramJson = JSON.parse(diagramContent);
            diagram = diagramJson;
        } else if (modelJson.diagram) {
            diagram = modelJson.diagram;
        }

        return {
            entities,
            services,
            associations,
            aliases,
            diagram
        };
    }
}
