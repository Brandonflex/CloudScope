using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Service for pushing real-time notifications to connected clients (via SignalR).
/// </summary>
public interface INotificationService
{
    Task NotifyResourceDiscovered(CloudResource resource);
    Task NotifyComplianceViolation(ComplianceViolation violation);
    Task NotifyCostAnomaly(CostAnomaly anomaly);
    Task NotifyScanProgress(string scanType, int progress, int total);
    Task NotifyDiscoveryProgress(CloudProvider provider, int completed, int total);
    Task NotifyDiscoveryCompleted(int totalResources, TimeSpan duration);
}
