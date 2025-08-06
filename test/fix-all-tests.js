import fs from 'fs';

const testFiles = [
    'test/mcp-test-cancel.js',
    'test/mcp-test-errors.js', 
    'test/mcp-test-check-after.js',
    'test/mcp-test-with-files.js'
];

for (const file of testFiles) {
    let content = fs.readFileSync(file, 'utf8');
    
    // First ensure imports are correct
    if (!content.includes("CallToolResultSchema")) {
        content = content.replace(
            "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';",
            `import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
    ListToolsResultSchema,
    CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';`
        );
    }
    
    // Fix all client.request calls that use tools/call to include CallToolResultSchema
    // This regex matches client.request with tools/call method without a schema
    content = content.replace(
        /await client\.request\((\s*{[\s\S]*?method:\s*['"]tools\/call['"][\s\S]*?}\s*)\)(?!\s*,)/g,
        'await client.request($1, CallToolResultSchema)'
    );
    
    // Also fix the ones that are already formatted with line breaks but missing schema
    content = content.replace(
        /await client\.request\((\s*{[\s\S]*?method:\s*['"]tools\/call['"][\s\S]*?}\s*)\);/g,
        'await client.request($1, CallToolResultSchema);'
    );
    
    fs.writeFileSync(file, content);
    console.log(`Fixed ${file}`);
}

console.log('\nDone! All test files have been updated.');