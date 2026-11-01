using System.Net;
using System.Text;
using System.Text.Json;
using Azure.Core;
using CloudScope.Core.Exceptions;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Services.Azure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace CloudScope.Tests.Unit;

public class AzureResourceGraphPaginationTests
{
    private const string Subscription = "11111111-1111-1111-1111-111111111111";
    private const string ResourceA = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg/providers/test/items/a";
    private const string ResourceB = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg/providers/test/items/b";
    private const string Other = "/subscriptions/22222222-2222-2222-2222-222222222222/resourceGroups/rg/providers/test/items/a";

    private sealed class TestCredential : TokenCredential
    {
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            new("test-token", DateTimeOffset.UtcNow.AddMinutes(5));
        public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GetToken(requestContext, cancellationToken));
    }

    private sealed class PageHandler(params string[] pages) : HttpMessageHandler
    {
        private readonly Queue<string> _pages = new(pages);
        public List<string> Requests { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            if (_pages.Count == 0) throw new InvalidOperationException("Unexpected extra request");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_pages.Dequeue(), Encoding.UTF8, "application/json")
            };
        }
    }

    private static string Page(string id, int total, string continuation = "")
    {
        var page = new Dictionary<string, object>
        {
            ["data"] = new[] { new { id, name = "example", type = "test/items" } },
            ["count"] = 1,
            ["totalRecords"] = total,
            ["resultTruncated"] = continuation != ""
        };
        if (continuation != "") page["$skipToken"] = continuation;
        return JsonSerializer.Serialize(page);
    }

    private static AzureResourceGraphService Create(PageHandler handler)
    {
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://example.invalid/") };
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient("AzureManagement")).Returns(client);
        return new AzureResourceGraphService(Options.Create(new AzureOptions { SubscriptionId = Subscription }),
            factory.Object, NullLogger<AzureResourceGraphService>.Instance, new TestCredential());
    }

    [Fact]
    public async Task CompleteMultiPageResultsAreCollectedInConfiguredScope()
    {
        var handler = new PageHandler(Page(ResourceA, 2, "next"), Page(ResourceB, 2));
        var resources = (await Create(handler).DiscoverResourcesAsync()).ToList();
        Assert.Equal(2, resources.Count);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Contains("next", handler.Requests[1]);
    }

    [Fact]
    public async Task MissingPageIsNotTreatedAsComplete()
    {
        await Assert.ThrowsAsync<CloudProviderException>(() => Create(new PageHandler(Page(ResourceA, 2))).DiscoverResourcesAsync());
    }

    [Theory]
    [InlineData("changed-total")]
    [InlineData("duplicate")]
    [InlineData("out-of-scope")]
    [InlineData("repeated-token")]
    public async Task UnsafePaginationIsRejected(string scenario)
    {
        var first = Page(ResourceA, 2, "next");
        var second = scenario switch
        {
            "changed-total" => Page(ResourceB, 3),
            "duplicate" => Page(ResourceA, 2),
            "out-of-scope" => Page(Other, 2),
            _ => Page(ResourceB, 2, "next")
        };
        await Assert.ThrowsAsync<CloudProviderException>(() => Create(new PageHandler(first, second)).DiscoverResourcesAsync());
    }
}
