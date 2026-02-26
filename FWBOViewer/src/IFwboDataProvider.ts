import { FwboData } from './fwboParser';

/**
 * Abstract interface for FWBO data providers.
 * Implementations can parse from different sources (XML, JSON, etc.)
 * but all return the same FwboData structure for rendering.
 */
export interface IFwboDataProvider {
    /**
     * Parse FWBO model and diagram data into a unified FwboData structure.
     * @param modelContent The model content (XML, JSON, etc.)
     * @param diagramContent Optional diagram content (XML, JSON, etc.)
     * @returns Parsed FwboData ready for rendering
     */
    parse(modelContent: string, diagramContent?: string): FwboData;
}
