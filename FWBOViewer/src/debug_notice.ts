import * as fs from 'fs';
import * as path from 'path';
import { FwboParser } from './fwboParser';

const fwboPath = '/Users/vaibhavdandekar/Illumify/Main/Models/Schema/Notice.fwbo';
const diagramPath = '/Users/vaibhavdandekar/Illumify/Main/Models/Schema/Notice.fwbo.diagram';

const fwboXml = fs.readFileSync(fwboPath, 'utf8');
const diagramXml = fs.readFileSync(diagramPath, 'utf8');

const parser = new FwboParser();
const data = parser.parse(fwboXml, diagramXml);

console.log('Connectors:', data.diagram.connectors.length);

// Check for a specific connector
// associationConnector Id="dafe06a6-4d62-4e30-8c9c-4c29960bd6c1"
const targetConnectorId = 'dafe06a6-4d62-4e30-8c9c-4c29960bd6c1';
const connector = data.diagram.connectors.find(c => c.id === targetConnectorId);

if (connector) {
    console.log('Found Connector:', connector);
    const assoc = data.associations.find(a => a.id === connector.associationId);
    if (assoc) {
        console.log('Linked Association:', assoc);
    } else {
        console.log('Linked Association NOT FOUND for ID:', connector.associationId);
    }
} else {
    console.log('Connector NOT FOUND:', targetConnectorId);
}
