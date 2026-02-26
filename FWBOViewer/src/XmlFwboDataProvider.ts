import { IFwboDataProvider } from './IFwboDataProvider';
import { FwboData, FwboParser } from './fwboParser';

/**
 * XML-based FWBO data provider.
 * Parses .fwbo XML files and .fwbo.diagram XML files into FwboData.
 */
export class XmlFwboDataProvider implements IFwboDataProvider {
    private parser: FwboParser;

    constructor() {
        this.parser = new FwboParser();
    }

    /**
     * Parse XML-based FWBO model and diagram files.
     * @param modelContent XML content from .fwbo file
     * @param diagramContent Optional XML content from .fwbo.diagram file
     * @returns Parsed FwboData structure
     */
    public parse(modelContent: string, diagramContent?: string): FwboData {
        return this.parser.parse(modelContent, diagramContent || '');
    }
}
