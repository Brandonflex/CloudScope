using System.Globalization;
using System.Text.Json;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Infrastructure.Helpers;

/// <summary>
/// Reads loosely-typed provider metadata (Dictionary&lt;string, object&gt;) in a way that
/// works for live cloud payloads (bool/string/number) and for JSON-deserialized demo
/// data (JsonElement).
/// </summary>
public static class ResourceProperties
{
    public static bool Has(CloudResource resource, string key) =>
        resource.Properties.TryGetValue(key, out var value) && value is not null;

    public static string? GetString(CloudResource resource, string key)
    {
        if (!resource.Properties.TryGetValue(key, out var value) || value is null)
            return null;

        return value switch
        {
            JsonElement element => element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                _ => element.ToString()
            },
            string text => text,
            bool flag => flag ? "true" : "false",
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString()
        };
    }

    public static bool? GetBool(CloudResource resource, string key)
    {
        var raw = GetString(resource, key);
        if (string.IsNullOrWhiteSpace(raw)) return null;

        if (bool.TryParse(raw, out var parsed)) return parsed;

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" or "yes" or "enabled" or "on" => true,
            "0" or "no" or "disabled" or "off" => false,
            _ => null
        };
    }

    public static double? GetDouble(CloudResource resource, string key)
    {
        var raw = GetString(resource, key);
        if (string.IsNullOrWhiteSpace(raw)) return null;

        return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    /// <summary>
    /// True when a comma-separated property contains the given token (e.g. open ports).
    /// </summary>
    public static bool ListContains(CloudResource resource, string key, string token)
    {
        var raw = GetString(resource, key);
        if (string.IsNullOrWhiteSpace(raw)) return false;

        return raw
            .Split(new[] { ',', ';', '|', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(item => string.Equals(item, token, StringComparison.OrdinalIgnoreCase));
    }
}
