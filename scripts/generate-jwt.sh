#!/bin/bash
# Generate JWT for Zitadel System API authentication
#
# Required environment variables:
#   ZITADEL_SYSTEMUSER_ID          - The system user ID (e.g., "systemuser")
#   ZITADEL_SYSTEMUSER_PRIVATE_KEY - Base64-encoded RSA private key
#   DOMAIN                         - The Zitadel domain (e.g., "dev.example.com")
#
# Usage:
#   source .env && ./scripts/generate-jwt.sh
#
set -e

# Validate required environment variables
if [ -z "$ZITADEL_SYSTEMUSER_ID" ]; then
    echo "Error: ZITADEL_SYSTEMUSER_ID environment variable is not set" >&2
    exit 1
fi

if [ -z "$ZITADEL_SYSTEMUSER_PRIVATE_KEY" ]; then
    echo "Error: ZITADEL_SYSTEMUSER_PRIVATE_KEY environment variable is not set" >&2
    exit 1
fi

if [ -z "$DOMAIN" ]; then
    echo "Error: DOMAIN environment variable is not set" >&2
    exit 1
fi

# Decode the private key
echo "$ZITADEL_SYSTEMUSER_PRIVATE_KEY" | base64 -d > /tmp/privkey.pem

# Get timestamps
IAT=$(date +%s)
EXP=$((IAT + 3600))

# Base64url encode function
base64url() {
    base64 | tr '+/' '-_' | tr -d '='
}

# Build JWT header
HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64url | tr -d '\n')

# Build JWT payload
# Note: The audience includes :80 because Zitadel's ExternalPort is configured to 80
AUDIENCE="https://zitadel.${DOMAIN}:80"
PAYLOAD=$(echo -n "{\"iss\":\"${ZITADEL_SYSTEMUSER_ID}\",\"sub\":\"${ZITADEL_SYSTEMUSER_ID}\",\"aud\":\"${AUDIENCE}\",\"iat\":$IAT,\"exp\":$EXP}" | base64url | tr -d '\n')

# Create signature
SIGNATURE=$(echo -n "$HEADER.$PAYLOAD" | openssl dgst -sha256 -sign /tmp/privkey.pem | base64url | tr -d '\n')

# Output the JWT
echo "$HEADER.$PAYLOAD.$SIGNATURE"
