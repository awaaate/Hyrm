#!/bin/bash
# Start the Session Intelligence Dashboard

echo "🚀 Starting Session Intelligence Dashboard..."
echo ""

cd "$(dirname "$0")"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo "❌ Error: Bun is not installed"
    echo "Please install Bun from https://bun.sh"
    exit 1
fi

# Start the server
exec bun dashboard/server.ts
