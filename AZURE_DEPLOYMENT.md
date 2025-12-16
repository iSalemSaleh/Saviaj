# AtlasRide - Azure Deployment Guide

Deploy AtlasRide to Azure App Service (Linux) with Azure Database for PostgreSQL.

## Prerequisites

- Azure account with active subscription
- Azure CLI installed (`az` command)
- Node.js 20+ installed locally

## Step 1: Create Azure Resources

### 1.1 Login and Create Resource Group
```bash
az login
az group create --name atlasride-rg --location uksouth
```

### 1.2 Create PostgreSQL Flexible Server
```bash
# Create database server
az postgres flexible-server create \
  --name atlasride-db \
  --resource-group atlasride-rg \
  --location uksouth \
  --admin-user atlasrideadmin \
  --admin-password "YourSecurePassword123!" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 15

# Create the database
az postgres flexible-server db create \
  --resource-group atlasride-rg \
  --server-name atlasride-db \
  --database-name atlasride

# Allow Azure services to connect
az postgres flexible-server firewall-rule create \
  --resource-group atlasride-rg \
  --name atlasride-db \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 1.3 Create App Service (Linux)
```bash
# Create App Service Plan
az appservice plan create \
  --name atlasride-plan \
  --resource-group atlasride-rg \
  --location uksouth \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --plan atlasride-plan \
  --runtime "NODE:20-lts"

# Enable WebSockets
az webapp config set \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --web-sockets-enabled true

# Set startup command
az webapp config set \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --startup-file "npm start"
```

## Step 2: Configure Environment Variables

```bash
az webapp config appsettings set \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --settings \
    NODE_ENV="production" \
    DATABASE_URL="postgresql://atlasrideadmin:YourSecurePassword123!@atlasride-db.postgres.database.azure.com:5432/atlasride?sslmode=require" \
    SESSION_SECRET="$(openssl rand -base64 32)" \
    AZURE_MAPS_KEY="your-azure-maps-key" \
    STRIPE_SECRET_KEY="sk_live_your_stripe_key"
```

## Step 3: Build and Deploy

### Build Locally
```bash
# Install dependencies
npm install

# Build the application
npm run build
```

### Deploy to Azure

**Option A: Deploy with Azure CLI (Recommended)**
```bash
# Deploy directly from current directory
az webapp up \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --runtime "NODE:20-lts"
```

**Option B: Deploy with Zip**
```bash
# Create deployment package
zip -r deploy.zip dist/ package.json package-lock.json

# Deploy
az webapp deploy \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --src-path deploy.zip \
  --type zip
```

**Option C: GitHub Actions (CI/CD)**
1. Go to Azure Portal > App Service > Deployment Center
2. Select GitHub as source
3. Authorize and select your repository
4. Azure creates a workflow file automatically

## Step 4: Initialize Database

Run the database schema push:

```bash
# Set connection string temporarily
export DATABASE_URL="postgresql://atlasrideadmin:YourSecurePassword123!@atlasride-db.postgres.database.azure.com:5432/atlasride?sslmode=require"

# Push schema to database
npm run db:push
```

## Step 5: Verify Deployment

1. Visit `https://atlasride-app.azurewebsites.net`
2. Test user registration
3. Test creating a ride offer
4. Test real-time features (maps, chat)

## Monitoring

### View Logs
```bash
# Stream live logs
az webapp log tail \
  --name atlasride-app \
  --resource-group atlasride-rg

# Enable logging
az webapp log config \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --application-logging filesystem \
  --level information
```

## Scaling

```bash
# Scale up to Standard tier
az appservice plan update \
  --name atlasride-plan \
  --resource-group atlasride-rg \
  --sku S1

# Scale out to multiple instances
az webapp scale \
  --name atlasride-app \
  --resource-group atlasride-rg \
  --instance-count 3
```

## Cost Estimate (UK South)

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| App Service | Basic B1 | ~£10 |
| PostgreSQL | Burstable B1ms | ~£12 |
| Azure Maps | Pay-as-you-go | ~£5-20 |
| **Total** | | **~£27-42/month** |

## Troubleshooting

### App not starting
```bash
# Check logs
az webapp log tail --name atlasride-app --resource-group atlasride-rg

# Verify environment variables
az webapp config appsettings list --name atlasride-app --resource-group atlasride-rg
```

### Database connection issues
- Verify firewall allows Azure services (0.0.0.0)
- Check `sslmode=require` in connection string
- Test connection locally first

### WebSocket not working
- Verify WebSockets enabled in App Service config
- Client must use `wss://` protocol
- Check if CORS allows the domain

## Custom Domain (Optional)

```bash
az webapp config hostname add \
  --webapp-name atlasride-app \
  --resource-group atlasride-rg \
  --hostname www.atlasride.com
```
