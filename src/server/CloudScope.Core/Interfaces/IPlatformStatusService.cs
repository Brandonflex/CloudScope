using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Exposes runtime information about the CloudScope deployment.
/// </summary>
public interface IPlatformStatusService
{
    Task<PlatformStatus> GetStatusAsync(CancellationToken ct = default);
}
