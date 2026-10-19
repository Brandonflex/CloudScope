// CloudScope — Main Azure Infrastructure (Bicep)
// Deploys: App Service, Cosmos DB, Azure SQL, Redis, SignalR, Service Bus, OpenAI, Key Vault

@description('Primary Azure region for all resources')
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Unique suffix to prevent naming collisions')
param uniqueSuffix string = uniqueString(resourceGroup().id)

@description('Azure AD tenant ID for authentication')
param aadTenantId string

@description('Azure AD client ID for the app registration')
param aadClientId string

var appName = 'cloudscope'
var resourcePrefix = '${appName}-${environment}-${uniqueSuffix}'
var tags = {
  Application: 'CloudScope'
  Environment: environment
  ManagedBy: 'Bicep'
}

// ─── Azure Cosmos DB (Gremlin API) ────────────────────────
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${resourcePrefix}-cosmos'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    consistencyPolicy: {
      defaultSessionConsistency: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    databaseAccountOfferType: 'Standard'
    enableFreeTier: environment == 'dev'
    capabilities: [
      {
        name: 'EnableGremlin'
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/gremlinDatabases@2024-05-15' = {
  name: 'cloudscope'
  parent: cosmosAccount
  properties: {
    resource: {
      id: 'cloudscope'
    }
  }
}

resource graphContainer 'Microsoft.DocumentDB/databaseAccounts/gremlinDatabases/graphs@2024-05-15' = {
  name: 'graph'
  parent: cosmosDatabase
  properties: {
    resource: {
      id: 'graph'
      partitionKey: {
        paths: ['/partitionKey']
      }
    }
  }
}

// ─── Azure SQL Server + Database ──────────────────────────
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${resourcePrefix}-sql'
  location: location
  tags: tags
  properties: {
    administratorLogin: 'cloudscopeadmin'
    administratorLoginPassword: 'CHANGE_ME_USE_KEY_VAULT'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: environment == 'dev' ? 'Enabled' : 'Disabled'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  name: 'CloudScope'
  parent: sqlServer
  location: location
  tags: tags
  sku: {
    name: environment == 'dev' ? 'Basic' : 'Standard'
    tier: environment == 'dev' ? 'Basic' : 'Standard'
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: environment == 'dev' ? 2147483648 : 268435456000
  }
}

// ─── Azure Cache for Redis ────────────────────────────────
resource redis 'Microsoft.Cache/redis@2024-03-01-preview' = {
  name: '${resourcePrefix}-redis'
  location: location
  tags: tags
  properties: {
    sku: {
      name: environment == 'dev' ? 'Basic' : 'Standard'
      family: environment == 'dev' ? 'C' : 'C'
      capacity: environment == 'dev' ? 0 : 1
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

// ─── Azure SignalR Service ────────────────────────────────
resource signalR 'Microsoft.SignalRService/signalR@2024-03-01-preview' = {
  name: '${resourcePrefix}-signalr'
  location: location
  tags: tags
  sku: {
    name: environment == 'dev' ? 'Free_F1' : 'Standard_S1'
    capacity: environment == 'dev' ? 1 : 2
  }
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Default'
      }
    ]
  }
}

// ─── Azure Service Bus ────────────────────────────────────
resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01-preview' = {
  name: '${resourcePrefix}-sb'
  location: location
  tags: tags
  sku: {
    name: environment == 'dev' ? 'Basic' : 'Standard'
  }
}

resource discoveryQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01-preview' = {
  name: 'resource-discovery'
  parent: serviceBus
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 5
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
  }
}

resource complianceQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01-preview' = {
  name: 'compliance-scan'
  parent: serviceBus
  properties: {
    lockDuration: 'PT5M'
    maxDeliveryCount: 3
    defaultMessageTimeToLive: 'P7D'
  }
}

// ─── Azure OpenAI Service ─────────────────────────────────
resource openAI 'Microsoft.CognitiveServices/accounts@2024-06-01-preview' = {
  name: '${resourcePrefix}-openai'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    publicNetworkAccess: environment == 'dev' ? 'Enabled' : 'Disabled'
    customSubDomainName: '${resourcePrefix}-openai'
  }
}

// ─── Key Vault ────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${resourcePrefix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: aadTenantId
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enableRbacAuthorization: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    sku: {
      family: 'A'
      name: environment == 'dev' ? 'standard' : 'standard'
    }
  }
}

// ─── App Service Plan ─────────────────────────────────────
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${resourcePrefix}-plan'
  location: location
  tags: tags
  sku: {
    name: environment == 'dev' ? 'B1' : 'S1'
    tier: environment == 'dev' ? 'Basic' : 'Standard'
  }
  properties: {
    reserved: true // Linux
  }
}

// ─── App Service (Backend API) ────────────────────────────
resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: '${resourcePrefix}-api'
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      appSettings: [
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: environment == 'dev' ? 'Development' : 'Production'
        }
        {
          name: 'CosmosDb__Endpoint'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'CosmosDb__Key'
          value: cosmosAccount.listKeys().primaryMasterKey
        }
        {
          name: 'AzureAd__TenantId'
          value: aadTenantId
        }
        {
          name: 'AzureAd__ClientId'
          value: aadClientId
        }
      ]
    }
    httpsOnly: true
  }
}

// ─── Static Web App (Frontend) ────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${resourcePrefix}-frontend'
  location: location
  tags: tags
  sku: {
    name: environment == 'dev' ? 'Free' : 'Standard'
  }
  properties: {
    repositoryUrl: 'https://github.com/Brandonflex/Azure'
    branch: 'main'
    buildProperties: {
      appLocation: 'src/client'
      outputLocation: 'dist/cloudscope/browser'
    }
  }
}

// ─── Outputs ──────────────────────────────────────────────
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output staticWebAppUrl string = staticWebApp.properties.defaultHostname
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output signalRConnectionString string = signalR.listKeys().primaryConnectionString
output serviceBusConnectionString string = serviceBus.listKeys().primaryConnectionString
output keyVaultUri string = keyVault.properties.vaultUri
output openAIEndpoint string = openAI.properties.endpoint
output redisHostName string = redis.properties.hostName