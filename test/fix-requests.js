import fs from 'fs';
import path from 'path';

const testFiles = [
    'test/mcp-test-cancel.js',
    'test/mcp-test-errors.js', 
    'test/mcp-test-check-after.js',
    'test/mcp-test-with-files.js'
];

for (const file of testFiles) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix all tools/call requests to add CallToolResultSchema
    content = content.replace(
        /await client\.request\(\s*\{\s*method:\s*'tools\/call'[^}]+\}\s*\);/gs,
        (match) => {
            // Add the schema parameter
            return match.replace(/\);$/, ',\n            CallToolResultSchema\n        );');
        }
    );
    
    fs.writeFileSync(file, content);
    console.log(`Fixed ${file}`);
}
