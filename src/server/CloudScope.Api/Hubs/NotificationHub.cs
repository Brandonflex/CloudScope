using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace CloudScope.Api.Hubs;

/// <summary>
/// SignalR hub used to push discovery, compliance and cost events to the SPA.
/// </summary>
public class NotificationHub : Hub
{
    private readonly ILogger<NotificationHub> _logger;

    public NotificationHub(ILogger<NotificationHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogDebug("SignalR client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogDebug("SignalR client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Lightweight ping used by the frontend to confirm the connection is live.
    /// </summary>
    public Task Ping() => Clients.Caller.SendAsync("pong", DateTime.UtcNow);
}

/// <summary>
/// Adapts <see cref="INotificationService"/> to SignalR hub messages.
/// </summary>
public class SignalRNotificationService : INotificationService
{
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<SignalRNotificationService> _logger;

    public SignalRNotificationService(
        IHubContext<NotificationHub> hub,
        ILogger<SignalRNotificationService> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public Task NotifyResourceDiscovered(CloudResource resource) =>
        SendAsync("resourceDiscovered", new
        {
            id = resource.Id,
            name = resource.Name,
            type = resource.ResourceType.ToString(),
            provider = resource.Provider.ToString()
        });

    public Task NotifyComplianceViolation(ComplianceViolation violation) =>
        SendAsync("complianceViolation", new
        {
            policyName = violation.PolicyName,
            resourceName = violation.ResourceName,
            severity = violation.Severity,
            details = violation.Details
        });

    public Task NotifyCostAnomaly(CostAnomaly anomaly) =>
        SendAsync("costAnomaly", new
        {
            resourceName = anomaly.ResourceName,
            actualCost = anomaly.ActualCost,
            expectedCost = anomaly.ExpectedCost,
            deviationPercentage = anomaly.DeviationPercentage,
            description = anomaly.Description
        });

    public Task NotifyScanProgress(string scanType, int progress, int total) =>
        SendAsync("scanProgress", new
        {
            scanType,
            progress,
            total,
            percentage = total == 0 ? 0 : (int)Math.Round(progress * 100.0 / total)
        });

    public Task NotifyDiscoveryProgress(CloudProvider provider, int completed, int total) =>
        SendAsync("discoveryProgress", new
        {
            provider = provider.ToString(),
            completed,
            total,
            percentage = total == 0 ? 0 : (int)Math.Round(completed * 100.0 / total)
        });

    public Task NotifyDiscoveryCompleted(int totalResources, TimeSpan duration) =>
        SendAsync("discoveryCompleted", new
        {
            totalResources,
            durationSeconds = Math.Round(duration.TotalSeconds, 1),
            completedAt = DateTime.UtcNow
        });

    private async Task SendAsync(string method, object payload)
    {
        try
        {
            await _hub.Clients.All.SendAsync(method, payload);
        }
        catch (Exception ex)
        {
            // Notifications are best-effort and must never break a request.
            _logger.LogDebug(ex, "SignalR notification '{Method}' failed.", method);
        }
    }
}
