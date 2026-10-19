using System.Text.Json.Serialization;
using CloudScope.Api.HostedServices;
using CloudScope.Api.Hubs;
using CloudScope.Api.Middleware;
using CloudScope.Core.Interfaces;
using CloudScope.GraphEngine.Services;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Persistence;
using CloudScope.Infrastructure.Repositories;
using CloudScope.Infrastructure.Runtime;
using CloudScope.Infrastructure.Services.AWS;
using CloudScope.Infrastructure.Services.Azure;
using CloudScope.Infrastructure.Services.Discovery;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.HttpOverrides;
using Serilog;
using Serilog.Sinks.ApplicationInsights.TelemetryConverters;

var builder = WebApplication.CreateBuilder(args);

// ─── Serilog ──────────────────────────────────────────────
var loggerConfiguration = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console();

var appInsightsConnection = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrWhiteSpace(appInsightsConnection))
{
    loggerConfiguration.WriteTo.ApplicationInsights(
        new TelemetryConfiguration { ConnectionString = appInsightsConnection },
        TelemetryConverter.Traces);
}

Log.Logger = loggerConfiguration.CreateLogger();
builder.Host.UseSerilog();

// ─── Configuration binding ────────────────────────────────
builder.Services.Configure<AzureOptions>(builder.Configuration.GetSection(AzureOptions.SectionName));
builder.Services.Configure<CosmosDbOptions>(builder.Configuration.GetSection(CosmosDbOptions.SectionName));
builder.Services.Configure<AwsOptions>(builder.Configuration.GetSection(AwsOptions.SectionName));
builder.Services.Configure<AzureOpenAIOptions>(builder.Configuration.GetSection(AzureOpenAIOptions.SectionName));
builder.Services.Configure<SignalROptions>(builder.Configuration.GetSection(SignalROptions.SectionName));
builder.Services.Configure<PlatformOptions>(builder.Configuration.GetSection(PlatformOptions.SectionName));
builder.Services.Configure<DiscoveryOptions>(builder.Configuration.GetSection(DiscoveryOptions.SectionName));

var platformOptions = builder.Configuration.GetSection(PlatformOptions.SectionName).Get<PlatformOptions>()
                      ?? new PlatformOptions();
var cosmosOptions = builder.Configuration.GetSection(CosmosDbOptions.SectionName).Get<CosmosDbOptions>()
                    ?? new CosmosDbOptions();

// ─── Runtime state ────────────────────────────────────────
builder.Services.AddSingleton<RuntimeState>();

// ─── Caching ──────────────────────────────────────────────
var redisConnection = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redisConnection))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnection;
        options.InstanceName = "CloudScope:";
    });
}
else
{
    // Zero-dependency default so the API runs without Redis.
    builder.Services.AddDistributedMemoryCache();
}

builder.Services.AddSingleton<ICacheService, RedisCacheService>();

// ─── Storage ──────────────────────────────────────────────
var useCosmos = platformOptions.StorageProvider.Equals("Cosmos", StringComparison.OrdinalIgnoreCase)
                && cosmosOptions.IsConfigured;

if (useCosmos)
{
    builder.Services.AddSingleton<CosmosDatabase>();
    builder.Services.AddScoped<IResourceRepository, CosmosResourceRepository>();
    builder.Services.AddScoped<IGraphRepository, CosmosGraphRepository>();
}
else
{
    builder.Services.AddSingleton<InMemoryCloudStore>();
    builder.Services.AddSingleton<IResourceRepository>(sp => sp.GetRequiredService<InMemoryCloudStore>());
    builder.Services.AddSingleton<IGraphRepository>(sp => sp.GetRequiredService<InMemoryCloudStore>());
}

// ─── Cloud provider services ──────────────────────────────
builder.Services.AddScoped<AzureResourceGraphService>();
builder.Services.AddScoped<AwsConfigService>();

builder.Services.AddScoped<ICloudProviderService>(sp => sp.GetRequiredService<AzureResourceGraphService>());
builder.Services.AddScoped<ICloudProviderService>(sp => sp.GetRequiredService<AwsConfigService>());

// ─── Domain services ──────────────────────────────────────
builder.Services.AddScoped<ICostService, AzureCostService>();
builder.Services.AddScoped<IComplianceService, AzureComplianceService>();
builder.Services.AddScoped<IAIQueryService, AzureAIQueryService>();
builder.Services.AddScoped<IBlastRadiusService, BlastRadiusService>();
builder.Services.AddScoped<IDiscoveryService, CloudDiscoveryService>();
builder.Services.AddScoped<IPlatformStatusService, PlatformStatusService>();
builder.Services.AddSingleton<INotificationService, SignalRNotificationService>();

// ─── SignalR ──────────────────────────────────────────────
builder.Services.AddSignalR();

// ─── HTTP clients ─────────────────────────────────────────
builder.Services.AddHttpClient("AzureManagement", client =>
{
    client.BaseAddress = new Uri("https://management.azure.com/");
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddHttpClient("AzureOpenAI", client =>
{
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddHttpClient();

// ─── API services ─────────────────────────────────────────
// ─── Reverse proxy (App Service terminates TLS) ───────────
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // App Service forwards traffic from platform-internal addresses.
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "CloudScope API",
        Version = "v1",
        Description = "Multi-cloud infrastructure intelligence platform — discovery, graph, blast radius, " +
                      "cost intelligence, compliance and natural-language query.",
        Contact = new Microsoft.OpenApi.Models.OpenApiContact
        {
            Name = "Brandonflex",
            Url = new Uri("https://github.com/Brandonflex/Azure")
        }
    });
});

// ─── CORS ─────────────────────────────────────────────────
var allowedOrigins = (builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>())
    .Concat(new[]
    {
        "http://localhost:4200", "https://localhost:4200",
        "http://127.0.0.1:4200", "http://localhost:4300"
    })
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials(); // Required for SignalR
    });
});

// ─── Application Insights ─────────────────────────────────
builder.Services.AddApplicationInsightsTelemetry();

// ─── Authentication/authorization plumbing ────────────────
// Phase 1 runs without an identity provider; the middleware is wired so Entra ID
// (OIDC) can be enabled later without changing the pipeline.
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

// ─── Background discovery ─────────────────────────────────
builder.Services.AddHostedService<DiscoveryBackgroundService>();

var app = builder.Build();

// ─── Middleware pipeline ──────────────────────────────────
app.UseForwardedHeaders();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment() || builder.Configuration.GetValue("Swagger:Enabled", true))
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "CloudScope API v1");
        options.RoutePrefix = "swagger";
    });
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// ─── Static SPA hosting ───────────────────────────────────
// A published build ships the Angular bundle in wwwroot, so one App Service
// serves both the SPA and the API from a single origin. This removes the
// cross-origin configuration (and the extra Static Web App) from deployment.
var webRoot = app.Environment.WebRootPath
              ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var spaIndex = Path.Combine(webRoot, "index.html");
var servesSpa = File.Exists(spaIndex);

if (servesSpa)
{
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions
    {
        OnPrepareResponse = context =>
        {
            var fileName = context.File.Name;
            context.Context.Response.Headers.CacheControl =
                fileName.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
                    ? "no-cache"
                    : "public,max-age=31536000,immutable";
        }
    });
}

app.UseCors("AllowAngular");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

if (servesSpa)
{
    // Client-side routes (/dashboard, /graph, …) resolve to the SPA shell.
    // Unknown API and hub paths must stay 404s rather than returning HTML.
    app.MapFallback(async context =>
    {
        if (context.Request.Path.StartsWithSegments("/api") ||
            context.Request.Path.StartsWithSegments("/hubs"))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache";
        await context.Response.SendFileAsync(Path.Combine(webRoot, "index.html"));
    });
}
else
{
    app.MapGet("/", () => Results.Redirect("/swagger"));
}
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow,
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "1.0.0"
}));

app.Services.GetRequiredService<RuntimeState>().StorageProvider = useCosmos ? "Cosmos" : "InMemory";

Log.Information(
    "CloudScope API starting. Storage={Storage}, DemoSeeding={SeedDemo}, Swagger=/swagger",
    useCosmos ? "Cosmos" : "InMemory",
    platformOptions.SeedDemoData);

app.Run();

// Make Program accessible for integration tests.
public partial class Program { }
