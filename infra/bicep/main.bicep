// CloudScope — Main Azure Infrastructure (Bicep)
// Deploys: App Service (API + Angular SPA), Cosmos DB (SQL API), Redis,
// Azure OpenAI, Application Insights and Key Vault.
//
// The SPA is published into the API's wwwroot, so a single App Service serves
// both from one origin — no Static Web App, no CORS configuration and no
// cross-origin API base URL to maintain.

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
var cosmosDatabaseName = 'CloudScope'
var resourcesContainerName = 'Resources'
var graphContainerName = 'Graph'
var tags = {
  Application: 'CloudScope'
  Environment: environment
  ManagedBy: 'Bicep'
}

// ─── Azure Cosmos DB (SQL API) ────────────────────────────
// The repositories use the SQL API with two containers:
//   Resources — partitioned by /provider
//   Graph     — partitioned by /sourceResourceId
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
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource resourcesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: resourcesContainerName
  properties: {
    resource: {
      id: resourcesContainerName
      partitionKey: {
        paths: ['/provider']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
  }
}

resource graphContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: graphContainerName
  properties: {
    resource: {
      id: graphContainerName
      partitionKey: {
        paths: ['/sourceResourceId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
      }
    }
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
      family: 'C'
      capacity: environment == 'dev' ? 0 : 1
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
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

// ─── Application Insights ─────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${resourcePrefix}-ai'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
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
      name: 'standard'
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

// ─── App Service (API + SPA) ──────────────────────────────
resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: '${resourcePrefix}-api'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      alwaysOn: environment != 'dev'
      http20Enabled: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'ASPNETCORE_ENVIRONMENT'
          value: environment == 'dev' ? 'Development' : 'Production'
        }
        {
          name: 'Platform__StorageProvider'
          value: 'Cosmos'
        }
        {
          name: 'Platform__SeedDemoData'
          value: environment == 'dev' ? 'true' : 'false'
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
          name: 'CosmosDb__DatabaseName'
          value: cosmosDatabaseName
        }
        {
          name: 'CosmosDb__ResourcesContainer'
          value: resourcesContainerName
        }
        {
          name: 'CosmosDb__GraphContainer'
          value: graphContainerName
        }
        {
          name: 'ConnectionStrings__Redis'
          value: '${redis.properties.hostName}:${redis.properties.sslPort},password=${redis.listKeys().primaryKey},ssl=True,abortConnect=False'
        }
        {
          name: 'AzureOpenAI__Endpoint'
          value: openAI.properties.endpoint
        }
        {
          name: 'AzureOpenAI__ApiKey'
          value: openAI.listKeys().key1
        }
        {
          name: 'ApplicationInsights__ConnectionString'
          value: appInsights.properties.ConnectionString
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
  }
}

// ─── Outputs ──────────────────────────────────────────────
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output keyVaultUri string = keyVault.properties.vaultUri
output openAIEndpoint string = openAI.properties.endpoint
output redisHostName string = redis.properties.hostName
output appInsightsConnectionString string = appInsights.properties.ConnectionString
