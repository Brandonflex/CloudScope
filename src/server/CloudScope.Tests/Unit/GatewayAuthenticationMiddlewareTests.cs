using CloudScope.Api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;

namespace CloudScope.Tests.Unit;

public class GatewayAuthenticationMiddlewareTests
{
    private const string Secret = "example-test-secret-at-least-32-bytes-long";

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("incorrect")]
    public async Task RejectsMissingOrIncorrectGatewaySecret(string? header)
    {
        var called = false;
        var middleware = Create(() => called = true);
        var context = NewContext("/api/resources");
        if (header != null) context.Request.Headers[GatewayAuthenticationMiddleware.HeaderName] = header;

        await middleware.InvokeAsync(context);

        Assert.False(called);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task AcceptsOnlySingleCorrectSecret()
    {
        var called = false;
        var middleware = Create(() => called = true);
        var context = NewContext("/hubs/notifications");
        context.Request.Headers[GatewayAuthenticationMiddleware.HeaderName] = Secret;
        await middleware.InvokeAsync(context);
        Assert.True(called);

        called = false;
        context = NewContext("/api/resources");
        context.Request.Headers.Append(GatewayAuthenticationMiddleware.HeaderName, Secret);
        context.Request.Headers.Append(GatewayAuthenticationMiddleware.HeaderName, Secret);
        await middleware.InvokeAsync(context);
        Assert.False(called);
        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
    }

    [Fact]
    public async Task HealthGetIsPublicButOtherPathsAndMethodsAreProtected()
    {
        var called = false;
        var middleware = Create(() => called = true);
        var health = NewContext("/health");
        await middleware.InvokeAsync(health);
        Assert.True(called);

        called = false;
        var other = NewContext("/health");
        other.Request.Method = "POST";
        await middleware.InvokeAsync(other);
        Assert.False(called);
        Assert.Equal(StatusCodes.Status401Unauthorized, other.Response.StatusCode);
    }

    [Fact]
    public void RejectsWeakConfiguration()
    {
        Assert.Throws<InvalidOperationException>(() => new GatewayAuthenticationMiddleware(
            _ => Task.CompletedTask,
            Options.Create(new GatewayAuthenticationOptions { Enabled = true, SharedSecret = "short" })));
    }

    private static GatewayAuthenticationMiddleware Create(Action onNext) => new(
        _ => { onNext(); return Task.CompletedTask; },
        Options.Create(new GatewayAuthenticationOptions { Enabled = true, SharedSecret = Secret }));

    private static DefaultHttpContext NewContext(string path)
    {
        var context = new DefaultHttpContext();
        context.RequestServices = new ServiceCollection().AddLogging().AddOptions().BuildServiceProvider();
        context.Request.Method = "GET";
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();
        return context;
    }
}
