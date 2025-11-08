#!/bin/bash

# Vercel Email Configuration Setup Script
# This script helps you add environment variables to Vercel

echo "🚀 Vercel Email Configuration Setup"
echo "===================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed"
    echo ""
    echo "Install it with:"
    echo "  npm install -g vercel"
    echo ""
    exit 1
fi

echo "✅ Vercel CLI is installed"
echo ""

# Login to Vercel
echo "📝 Step 1: Login to Vercel"
echo "-------------------------"
vercel login
echo ""

# Add environment variables
echo "📝 Step 2: Adding Environment Variables"
echo "---------------------------------------"
echo ""

echo "Adding RESEND_API_KEY..."
echo "re_TP1fp7vH_4f8dHUoKyLDGwzjZ9iTcrnki" | vercel env add RESEND_API_KEY production
echo ""

echo "Adding ADMIN_EMAIL..."
echo "jetsetters721@gmail.com" | vercel env add ADMIN_EMAIL production
echo ""

echo "Adding FRONTEND_URL..."
echo "https://jetsetterss.com" | vercel env add FRONTEND_URL production
echo ""

# Redeploy
echo "📝 Step 3: Redeploying Application"
echo "----------------------------------"
echo ""
read -p "Do you want to redeploy now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying to production..."
    vercel --prod
    echo ""
    echo "✅ Deployment complete!"
else
    echo "⚠️  Skipping deployment. Run 'vercel --prod' manually when ready."
fi

echo ""
echo "✅ Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Wait for deployment to finish (if you deployed)"
echo "2. Test by submitting an inquiry on https://jetsetterss.com"
echo "3. Check jetsetters721@gmail.com inbox for emails"
echo "4. Check Resend dashboard: https://resend.com/logs"
echo ""
echo "📚 For more details, see: VERCEL_EMAIL_SETUP.md"
