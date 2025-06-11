#!/bin/bash

# This script simulates how the package will work when installed via npm

echo "Testing npm package simulation..."

# 1. Build the project
echo "Building project..."
npm run build

# 2. Test that the bin script works with default (serve) command
echo "Testing default serve command..."
timeout 1s node bin/mcp-read-website.js 2>&1 | grep -q "read-website-fast MCP server running"
if [ $? -eq 0 ]; then
    echo "✓ Default serve command works"
else
    echo "✗ Default serve command failed"
    exit 1
fi

# 3. Test that the bin script works with explicit serve command
echo "Testing explicit serve command..."
timeout 1s node bin/mcp-read-website.js serve 2>&1 | grep -q "read-website-fast MCP server running"
if [ $? -eq 0 ]; then
    echo "✓ Explicit serve command works"
else
    echo "✗ Explicit serve command failed"
    exit 1
fi

# 4. Test that the fetch command works
echo "Testing fetch command help..."
node bin/mcp-read-website.js fetch --help > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Fetch command works"
else
    echo "✗ Fetch command failed"
    exit 1
fi

echo ""
echo "All tests passed! Package is ready for npm deployment."