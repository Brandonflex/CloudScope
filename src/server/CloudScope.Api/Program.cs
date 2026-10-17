using CloudScope.Core.Interfaces;
using CloudScope.GraphEngine.Services;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Services.AWS;
using CloudScope.Infrastructure.Services.Azure;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ─── Serilog ──────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.ApplicationInsights(
        builder.Configuration["ApplicationInsights:ConnectionString"] ?? "",
        TelemetryConverter.Traces)
    .CreateLogger();

builder.Host.UseSerilog();

// ─── Configuration binding ────────────────────────────────
builder.Services.Configure<AzureOptions>(builder.Configuration.GetSection(AzureOptions.SectionName));
builder.Services.Configure<CosmosDbOptions>(builder.Configuration.GetSection(CosmosDbOptions.SectionName));
builder.Services.Configure<AwsOptions>(builder.Configuration.GetSection(AwsOptions.SectionName));
builder.Services.Configure<AzureOpenAIOptions>(builder.Configuration.GetSection(AzureOpenAIOptions.SectionName));
builder.Services.Configure<SignalROptions>(builder.Configuration.GetSection(SignalROptions.SectionName));

// ─── Caching (Redis) ──────────────────────────────────────
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
    options.InstanceName = "CloudScope:";
});
builder.Services.AddSingleton<ICacheService, RedisCacheService>();

// ─── Cloud Provider Services ──────────────────────────────
builder.Services.AddScoped<AzureResourceGraphService>();
builder.Services.AddScoped<AwsConfigService>();

// Register as ICloudProviderService collection for multi-cloud resolution
builder.Services.AddScoped<ICloudProviderService>(sp => sp.GetRequiredService<AzureResourceGraphService>());
builder.Services.AddScoped<ICloudProviderService>(sp => sp.GetRequiredService<AwsConfigService>());

// ─── Domain Services ──────────────────────────────────────
// TODO: Register actual implementations once Cosmos DB repository is fully implemented
// builder.Services.AddScoped<IResourceRepository, CosmosResourceRepository>();
// builder.Services.AddScoped<IGraphRepository, CosmosGraphRepository>();
builder.Services.AddScoped<ICostService, AzureCostService>();
builder.Services.AddScoped<IComplianceService, AzureComplianceService>();
builder.Services.AddScoped<IAIQueryService, AzureAIQueryService>();
builder.Services.AddScoped<IBlastRadiusService, BlastRadiusService>();

// ─── SignalR ──────────────────────────────────────────────
builder.Services.AddSignalR();

// ─── HTTP Clients ─────────────────────────────────────────
builder.Services.AddHttpClient("AzureManagement", client =>
{
    client.BaseAddress = new Uri("https://management.azure.com/");
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});

builder.Services.AddHttpClient("AwsCostExplorer", client =>
{
    client.BaseAddress = new Uri($"https://ce.{builder.Configuration["AWS:Region"] ?? "us-east-1"}.amazonaws.com/");
});

// ─── API Services ─────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "CloudScope API",
        Version = "v1",
        Description = "Multi-Cloud Infrastructure Intelligence Platform API",
        Contact = new Microsoft.OpenApi.Models.OpenApiContact
        {
            Name = "Brandonflex",
            Url = new Uri("https://github.com/Brandonflex/Azure")
        }
    });
});

// ─── CORS ─────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular", policy =>
    {
        policy.WithOrigins(
                "http://localhost:4200",   // Angular dev server
                "https://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials(); // Required for SignalR
    });
});

// ─── Application Insights ─────────────────────────────────
builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

// ─── Middleware Pipeline ──────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("AllowAngular");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// ─── Health Check Endpoint ────────────────────────────────
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow,
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "1.0.0"
}));

// ─── SignalR Hub ──────────────────────────────────────────
// app.MapHub<NotificationHub>("/hubs/notifications");

app.Run();

// Make Program accessible for integration tests
public partial class Program { }