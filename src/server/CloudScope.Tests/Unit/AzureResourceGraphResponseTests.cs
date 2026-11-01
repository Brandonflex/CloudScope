using System.Text.Json;
using CloudScope.Infrastructure.Services.Azure;

namespace CloudScope.Tests.Unit;

public class AzureResourceGraphResponseTests
{
    [Fact]
    public void EmptyDataIsAValidEmptyPage()
    {
        using var document = JsonDocument.Parse("{\"data\":[],\"count\":0,\"totalRecords\":0,\"resultTruncated\":\"false\"}");
        var page = AzureResourceGraphService.ValidatePage(document.RootElement);
        Assert.Equal(0, page.Data.GetArrayLength());
        Assert.Equal(0, page.TotalRecords);
        Assert.Null(page.SkipToken);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"data\":null,\"count\":0,\"totalRecords\":0,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":0,\"resultTruncated\":true}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":0,\"resultTruncated\":\"true\"}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":0,\"$skipToken\":\"\",\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":0,\"resultTruncated\":\"unknown\"}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":0}")]
    [InlineData("{\"data\":[],\"totalRecords\":0,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":0,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":1,\"totalRecords\":1,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":\"0\",\"totalRecords\":0,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[{}],\"count\":1,\"totalRecords\":0,\"resultTruncated\":false}")]
    [InlineData("{\"data\":[],\"count\":0,\"totalRecords\":-1,\"resultTruncated\":false}")]
    public void MalformedOrUnpageableResponsesFailInsteadOfLookingEmpty(string json)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Throws<CloudScope.Core.Exceptions.CloudProviderException>(
            () => AzureResourceGraphService.ValidatePage(document.RootElement));
    }

    [Fact]
    public void TruncatedPageWithContinuationIsAccepted()
    {
        using var document = JsonDocument.Parse("{\"data\":[],\"count\":0,\"totalRecords\":2,\"resultTruncated\":true,\"$skipToken\":\"next\"}");
        Assert.Equal("next", AzureResourceGraphService.ValidatePage(document.RootElement).SkipToken);
    }

    [Theory]
    [InlineData("/subscriptions/abc/resourceGroups/group/providers/test/item", "abc", true)]
    [InlineData("/SUBSCRIPTIONS/ABC/resourceGroups/group/providers/test/item", "abc", true)]
    [InlineData("/subscriptions/abcdef/resourceGroups/group/providers/test/item", "abc", false)]
    [InlineData("/subscriptions/other/resourceGroups/group/providers/test/item", "abc", false)]
    [InlineData("/subscriptions/abc", "abc", false)]
    [InlineData("/subscriptions/abc/resourceGroups/group", "", false)]
    public void ResourceMustBeInsideConfiguredSubscription(string id, string subscription, bool expected)
    {
        Assert.Equal(expected, AzureResourceGraphService.IsInSubscription(id, subscription));
    }
}
