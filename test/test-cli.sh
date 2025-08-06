#!/bin/bash

# Test the MCP Task Server using the CLI directly
echo "🧪 Testing MCP Task Server via CLI"
echo "=================================="
echo ""

# Build first
echo "📦 Building..."
npm run build

echo ""
echo "Test 1: Simple task"
echo "-------------------"
npm run dev -- --task "Count from 1 to 5" --model mini

echo ""
echo "Test 2: Task with context"
echo "------------------------"
npm run dev -- \
  --task "Write a function to calculate fibonacci" \
  --model code \
  --context "Use Python with memoization"

echo ""
echo "Test 3: Task with output specification"
echo "--------------------------------------"
npm run dev -- \
  --task "Explain quantum computing" \
  --model standard \
  --output "A simple paragraph for beginners"

echo ""
echo "✅ CLI tests complete!"