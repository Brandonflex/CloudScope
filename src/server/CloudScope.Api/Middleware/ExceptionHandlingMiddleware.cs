using System.Diagnostics;
using System.Net;
using System.Text.Json;
using CloudScope.Core.Exceptions;
using Microsoft.AspNetCore.WebUtilities;

namespace CloudScope.Api.Middleware;

/// <summary>
/// Global exception handling middleware that maps domain exceptions to HTTP responses.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, message) = exception switch
        {
            ResourceNotFoundException ex => (HttpStatusCode.NotFound, ex.Message),
            CloudProviderException => (HttpStatusCode.BadGateway, UpstreamMessage),
            AIQueryException => (HttpStatusCode.InternalServerError, UpstreamMessage),
            ArgumentException ex => (HttpStatusCode.BadRequest, ex.Message),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized, "Unauthorized"),
            _ => (HttpStatusCode.InternalServerError, GenericMessage)
        };

        // The trace id is the only server-side detail a client needs for 5xx;
        // upstream URLs, response bodies and stack traces stay in the logs.
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;

        if ((int)statusCode >= 500)
        {
            _logger.LogError(exception, "Request {Method} {Path} failed ({StatusCode}). TraceId={TraceId}",
                context.Request.Method, context.Request.Path, (int)statusCode, traceId);
        }
        else
        {
            _logger.LogWarning("Request {Method} {Path} rejected ({StatusCode}): {Message}",
                context.Request.Method, context.Request.Path, (int)statusCode, message);
        }

        if (context.Response.HasStarted)
        {
            _logger.LogWarning("Response already started; cannot write error payload.");
            return;
        }

        context.Response.ContentType = "application/problem+json";
        context.Response.StatusCode = (int)statusCode;

        var response = new
        {
            type = $"https://httpstatuses.io/{(int)statusCode}",
            title = ReasonPhrases.GetReasonPhrase((int)statusCode),
            status = (int)statusCode,
            detail = message,
            traceId,
            timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsync(JsonSerializer.Serialize(response));
    }

    private const string GenericMessage = "An unexpected error occurred. Quote the trace id when reporting it.";
    private const string UpstreamMessage = "An upstream cloud service did not respond successfully. See the server logs.";
}