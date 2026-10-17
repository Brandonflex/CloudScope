# CloudScope — Deployment Guide

## Prerequisites

### Azure Resources Required
- Azure Subscription (with Contributor access)
- Azure Entra ID tenant (for authentication)
- Azure OpenAI Service (GPT-4 deployment)

### AWS Resources Required
- AWS Account (with admin access for initial setup)
- AWS Config enabled in target regions
- Cost Explorer enabled

## Local Development

### 1. Clone and setup

```bash
git clone https://github.com/Brandonflex/Azure.git
cd Azure
```

### 2. Start infrastructure services

```bash
docker-compose up -d
```

This starts:
- **Cosmos DB Emulator** on port 8081 (Gremlin API on 10251)
- **Redis** on port 6379
- **Azure SQL Edge** on port 1433

### 3. Configure the backend

```bash
cd src/server

# Copy template and fill in your values
cp CloudScope.Api/appsettings.Development.template.json \
   CloudScope.Api/appsettings.Development.json

# Set user secrets for sensitive values
dotnet user-secrets init --project CloudScope.Api
dotnet user-secrets set "AzureAd:ClientId" "your-client-id" --project CloudScope.Api
dotnet user-secrets set "AzureAd:TenantId" "your-tenant-id" --project CloudScope.Api
dotnet user-secrets set "AzureOpenAI:ApiKey" "your-api-key" --project CloudScope.Api
dotnet user-secrets set "AWS:AccessKeyId" "your-access-key" --project CloudScope.Api
dotnet user-secrets set "AWS:SecretAccessKey" "your-secret-key" --project CloudScope.Api
```

### 4. Run the backend

```bash
dotnet restore
dotnet run --project CloudScope.Api
```

API available at `https://localhost:5001` (Swagger at `/swagger`).

### 5. Run the frontend

```bash
cd src/client
npm install
ng serve
```

Dashboard available at `http://localhost:4200`.

## Azure Deployment

### Using Bicep

```bash
# Login to Azure
az login

# Create resource group
az group create --name cloudscope-rg --location eastus

# Deploy infrastructure
az deployment group create \
  --resource-group cloudscope-rg \
  --template-file infra/bicep/main.bicep \
  --parameters @infra/bicep/parameters.prod.json
```

### Using GitHub Actions

Push to `main` branch to trigger the CI/CD pipeline. See `.github/workflows/` for details.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_TENANT_ID` | Azure AD tenant ID | Yes |
| `AZURE_CLIENT_ID` | App registration client ID | Yes |
| `AZURE_CLIENT_SECRET` | App registration secret | Yes |
| `COSMOS_DB_ENDPOINT` | Cosmos DB connection endpoint | Yes |
| `COSMOS_DB_KEY` | Cosmos DB access key | Yes |
| `REDIS_CONNECTION_STRING` | Redis connection string | Yes |
| `SQL_CONNECTION_STRING` | Azure SQL connection string | Yes |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint | Yes |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | For AWS |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | For AWS |
| `AWS_REGION` | Primary AWS region | For AWS |
| `SIGNALR_CONNECTION_STRING` | SignalR Service connection | Prod |