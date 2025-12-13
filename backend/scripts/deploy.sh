#!/bin/bash
# Deployment script for ChatBaby backend

set -e

echo "🚀 Starting deployment..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

echo "✅ Deployment preparation complete!"
