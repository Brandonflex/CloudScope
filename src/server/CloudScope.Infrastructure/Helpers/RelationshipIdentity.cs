using System.Security.Cryptography;
using System.Text;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Infrastructure.Helpers;

/// <summary>
/// Produces stable relationship ids so repeated syncs update an edge instead of
/// creating duplicates (important for document stores and idempotent discovery).
/// </summary>
public static class RelationshipIdentity
{
    public static string For(string sourceId, string targetId, string relationshipType)
    {
        var raw = $"{sourceId}|{targetId}|{relationshipType}".ToLowerInvariant();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash, 0, 16).ToLowerInvariant();
    }

    public static string For(ResourceRelationship relationship) =>
        For(relationship.SourceResourceId, relationship.TargetResourceId, relationship.RelationshipType.ToString());

    /// <summary>
    /// Assigns a deterministic id when one is missing.
    /// </summary>
    public static void EnsureId(ResourceRelationship relationship)
    {
        if (string.IsNullOrWhiteSpace(relationship.Id))
        {
            relationship.Id = For(relationship);
        }
    }
}
