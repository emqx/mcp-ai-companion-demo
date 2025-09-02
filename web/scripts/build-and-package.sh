#!/bin/bash

# Build and package script for mcp-ai-companion-demo web
# Usage: npm run package or pnpm package

set -e

PROJECT_NAME="mcp-ai-companion-demo"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PACKAGE_NAME="${PROJECT_NAME}-web-${TIMESTAMP}.tar.gz"

echo "🚀 Building project..."
pnpm build

echo "📦 Creating package: ${PACKAGE_NAME}"
tar -czf "${PACKAGE_NAME}" dist/

echo "✅ Package created successfully: ${PACKAGE_NAME}"
echo "📁 Package size: $(du -h ${PACKAGE_NAME} | cut -f1)"

echo ""
echo "🎯 Package ready for deployment!"
echo "   File: ${PACKAGE_NAME}"
echo "   Contents: dist/ directory with built assets"