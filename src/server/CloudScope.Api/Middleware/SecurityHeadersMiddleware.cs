namespace CloudScope.Api.Middleware;

/// <summary>
/// Adds the baseline browser-hardening headers to every response.
/// A Content-Security-Policy is intentionally left to the host: Angular needs
/// inline styles for Material and the demo build inlines critical CSS.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "SAMEORIGIN";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";

        // Swagger UI ships inline scripts; everything else is served by this app.
        if (!context.Request.Path.StartsWithSegments("/swagger"))
        {
            headers["X-Permitted-Cross-Domain-Policies"] = "none";
        }

        return _next(context);
    }
}
