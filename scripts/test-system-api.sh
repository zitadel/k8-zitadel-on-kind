#!/bin/bash
# Test Zitadel System API authentication
#
# This script sources .env, generates a JWT, and calls the System API.
#
# Usage:
#   ./scripts/test-system-api.sh
#
set -e

# Change to script directory and source .env from parent
cd "$(dirname "$0")/.."
source .env

# Generate JWT
JWT=$("$(dirname "$0")/generate-jwt.sh")

echo "Testing System API with JWT..."
echo "JWT: ${JWT:0:50}..."
echo ""

# Call System API
grpcurl -H "Authorization: Bearer $JWT" "zitadel.${DOMAIN}:443" zitadel.system.v1.SystemService/ListInstances
