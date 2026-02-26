import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const fwboPath = '/Users/vaibhavdandekar/Illumify/Main/Models/Schema/Main.fwbo';

if (fs.existsSync(fwboPath)) {
    const xmlData = fs.readFileSync(fwboPath, 'utf8');
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });
    const jsonObj = parser.parse(xmlData);

    console.log(JSON.stringify(jsonObj, null, 2));
} else {
    console.log('File not found');
}
