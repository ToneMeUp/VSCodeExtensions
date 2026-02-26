import * as fs from 'fs';
import * as path from 'path';
import { FwboParser } from './fwboParser';

// Test with Main.fwbo
const fwboPath = '/Users/vaibhavdandekar/Illumify/Main/Models/Schema/Main.fwbo';
const diagramPath = fwboPath + '.diagram';

if (fs.existsSync(fwboPath)) {
    console.log(`Reading ${fwboPath}...`);
    const fwboXml = fs.readFileSync(fwboPath, 'utf8');
    let diagramXml = '';
    if (fs.existsSync(diagramPath)) {
        console.log(`Reading ${diagramPath}...`);
        diagramXml = fs.readFileSync(diagramPath, 'utf8');
    }

    const parser = new FwboParser();
    const data = parser.parse(fwboXml, diagramXml);

    console.log('--- Parsing Result ---');
    console.log(`Entities: ${data.entities.length}`);
    console.log(`Services: ${data.services.length}`);
    console.log(`Aliases: ${data.aliases.length}`);
    console.log(`Associations: ${data.associations.length}`);
    console.log(`Diagram Shapes: ${data.diagram.shapes.length}`);
    console.log(`Diagram Connectors: ${data.diagram.connectors.length}`);

    if (data.entities.length > 0) {
        console.log('First Entity:', JSON.stringify(data.entities[0], null, 2));
    }
    if (data.services.length > 0) {
        console.log('First Service:', JSON.stringify(data.services[0], null, 2));
    }
    if (data.aliases.length > 0) {
        console.log('First Alias:', JSON.stringify(data.aliases[0], null, 2));
    }

    // Check for specific entities like 'Container' or 'Batch'
    const container = data.entities.find(e => e.name === 'Container');
    if (container) {
        console.log('Found Container entity:', container);
    }
} else {
    console.error(`File not found: ${fwboPath}`);
}
