using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace CloudScope.Api.Middleware;

/// <summary>
/// Authenticates the trusted gateway, not the end user. The gateway must enforce
/// user authentication and replace (never forward) the secret header itself.
/// </summary>
public sealed class GatewayAuthenticationMiddleware
{
    public const string HeaderName = "X-CloudScope-Gateway-Key";
    private readonly RequestDelegate _next;
    private readonly GatewayAuthenticationOptions _options;
    private readonly byte[]? _expectedHash;

    public GatewayAuthenticationMiddleware(RequestDelegate next, IOptions<GatewayAuthenticationOptions> options)
    {
        _next = next;
        _options = options.Value;
        if (_options.Enabled)
        {
            if (string.IsNullOrWhiteSpace(_options.SharedSecret) || Encoding.UTF8.GetByteCount(_options.SharedSecret) < 32)
                throw new InvalidOperationException("Gateway authentication requires a shared secret of at least 32 UTF-8 bytes.");
            _expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(_options.SharedSecret));
        }
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.Enabled ||
            (HttpMethods.IsGet(context.Request.Method) && context.Request.Path == "/health"))
        {
            await _next(context);
            return;
        }

        var values = context.Request.Headers[HeaderName];
        if (values.Count != 1 || string.IsNullOrEmpty(values[0]) ||
            !CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(values[0]!)), _expectedHash!))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.Headers.CacheControl = "no-store";
            await context.Response.WriteAsJsonAsync(new { message = "Gateway authentication required." });
            return;
        }

        await _next(context);
    }
}

public sealed class GatewayAuthenticationOptions
{
    public bool Enabled { get; set; }
    public string? SharedSecret { get; set; }
}
