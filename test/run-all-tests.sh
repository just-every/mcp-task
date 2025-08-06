#!/bin/bash

# Script to run all MCP tests
echo "🧪 MCP Task Server Test Suite"
echo "=============================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Move to the parent directory (project root)
cd "$SCRIPT_DIR/.."

# Build the project first
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Array of test scripts
tests=(
    "mcp-test-simple.js"
    "mcp-test-with-files.js"
    "mcp-test-multiple-tasks.js"
    "mcp-test-cancel.js"
    "mcp-test-errors.js"
    "mcp-test-check-after.js"
)

# Run each test
for test in "${tests[@]}"; do
    echo ""
    echo "🔄 Running: $test"
    echo "----------------------------------------"
    node test/$test
    
    if [ $? -ne 0 ]; then
        echo "❌ Test failed: $test"
    else
        echo "✅ Test passed: $test"
    fi
    
    echo ""
    echo "=========================================="
    
    # Small delay between tests
    sleep 2
done

echo ""
echo "🎉 All tests completed!"