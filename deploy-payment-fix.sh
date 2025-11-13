#!/bin/bash

# Payment API Fix Deployment Script
# This script deploys the improved payment API with better error handling

echo "🚀 Payment API Fix Deployment"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📝 Step 1: Checking git status..."
if ! git diff --quiet; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Git status checked${NC}"
echo ""

echo "🏗️  Step 2: Building production assets..."
if npm run build; then
    echo -e "${GREEN}✅ Build completed successfully${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo ""

echo "📦 Step 3: Committing changes..."
git add api/payments.js
git add resources/js/Pages/Common/InquiryDetail.jsx
git add PAYMENT_FIX_DEPLOYMENT.md
git add test-production-payment.js
git add deploy-payment-fix.sh

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
else
    git commit -m "fix: Improve payment API error handling and add debug endpoints

- Enhanced error logging with detailed request/response info
- Improved Supabase client initialization with fallbacks
- Better ARC Pay response handling for different formats
- Added health check endpoint (/api/payments?action=health)
- Added debug endpoint (/api/payments?action=debug)
- Separated database errors from not-found errors
- Added comprehensive error messages for troubleshooting
- Improved Pay Now button with better validation and UX"
    
    echo -e "${GREEN}✅ Changes committed${NC}"
fi
echo ""

echo "🔄 Step 4: Pushing to remote..."
CURRENT_BRANCH=$(git branch --show-current)
echo "   Branch: $CURRENT_BRANCH"

if git push origin "$CURRENT_BRANCH"; then
    echo -e "${GREEN}✅ Pushed to remote successfully${NC}"
else
    echo -e "${RED}❌ Push failed${NC}"
    echo "   Please check your git remote configuration"
    exit 1
fi
echo ""

echo "⏳ Step 5: Waiting for deployment (30 seconds)..."
echo "   Your hosting platform should automatically deploy the changes"
for i in {30..1}; do
    echo -ne "   ⏳ $i seconds remaining...\r"
    sleep 1
done
echo -e "\n"

echo "🧪 Step 6: Testing production API..."
echo ""

# Test health endpoint
echo "   Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "https://www.jetsetterss.com/api/payments?action=health")
if echo "$HEALTH_RESPONSE" | grep -q '"success":true'; then
    echo -e "   ${GREEN}✅ Health check passed${NC}"
else
    echo -e "   ${YELLOW}⚠️  Health check response:${NC}"
    echo "   $HEALTH_RESPONSE"
fi
echo ""

# Test debug endpoint
echo "   Testing debug endpoint..."
DEBUG_RESPONSE=$(curl -s "https://www.jetsetterss.com/api/payments?action=debug")
if echo "$DEBUG_RESPONSE" | grep -q '"success":true'; then
    echo -e "   ${GREEN}✅ Debug endpoint working${NC}"
else
    echo -e "   ${YELLOW}⚠️  Debug endpoint response:${NC}"
    echo "   $DEBUG_RESPONSE"
fi
echo ""

echo "=============================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "=============================="
echo ""
echo "📋 Next Steps:"
echo "   1. Visit: https://www.jetsetterss.com"
echo "   2. Navigate to an inquiry with a quote"
echo "   3. Click the 'Pay Now' button"
echo "   4. Check browser console (F12) for detailed logs"
echo ""
echo "🔍 Debugging:"
echo "   • Health check: https://www.jetsetterss.com/api/payments?action=health"
echo "   • Debug info: https://www.jetsetterss.com/api/payments?action=debug"
echo ""
echo "📊 Monitor server logs:"
echo "   • Vercel: vercel logs"
echo "   • PM2: pm2 logs jetset-app"
echo "   • Docker: docker logs jetset-app"
echo ""

