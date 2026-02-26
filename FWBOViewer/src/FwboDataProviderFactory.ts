import { IFwboDataProvider } from './IFwboDataProvider';
import { XmlFwboDataProvider } from './XmlFwboDataProvider';
import { JsonFwboDataProvider } from './JsonFwboDataProvider';

/**
 * Factory for creating appropriate FWBO data providers.
 * Auto-detects format (XML vs JSON) and returns the correct provider.
 */
export class FwboDataProviderFactory {
    /**
     * Create a data provider based on the content format.
     * Currently supports:
     * - XML (default, existing .fwbo format)
     * - JSON (future support)
     *
     * @param content The file content to analyze
     * @returns Appropriate IFwboDataProvider implementation
     */
    public static createProvider(content: string): IFwboDataProvider {
        // Detect format by checking first non-whitespace character
        const trimmed = content.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            // JSON format detected
            return new JsonFwboDataProvider();
        }

        // Default to XML provider (existing format)
        return new XmlFwboDataProvider();
    }

    /**
     * Create a provider for a specific format explicitly.
     * Use when you know the format in advance.
     *
     * @param format The format type ('xml' or 'json')
     * @returns Appropriate IFwboDataProvider implementation
     */
    public static createProviderByFormat(format: 'xml' | 'json'): IFwboDataProvider {
        switch (format.toLowerCase()) {
            case 'xml':
                return new XmlFwboDataProvider();
            case 'json':
                return new JsonFwboDataProvider();
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
}
