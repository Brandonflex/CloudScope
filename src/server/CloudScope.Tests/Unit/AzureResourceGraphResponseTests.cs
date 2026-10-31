using System.Text.Json;
using CloudScope.Infrastructure.Services.Azure;

namespace CloudScope.Tests.Unit;

public class AzureResourceGraphResponseTests
{
    [Fact]
    public void EmptyDataIsAValidEmptyPage()
    {
        using var document = JsonDocument.Parse("{\"data\":[],\"resultTruncated\":\"false\"}");
        var page = AzureResourceGraphService.ValidatePage(document.RootElement);
        Assert.Equal(0, page.Data.GetArrayLength());
        Assert.Null(page.SkipToken);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"data\":null}")]
    [InlineData("{\"data\":[],\"resultTruncated\":true}")]
    [InlineData("{\"data\":[],\"resultTruncated\":\"true\"}")]
    [InlineData("{\"data\":[],\"$skipToken\":\"\"}")]
    [InlineData("{\"data\":[],\"resultTruncated\":\"unknown\"}")]
    public void MalformedOrUnpageableResponsesFailInsteadOfLookingEmpty(string json)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Throws<CloudScope.Core.Exceptions.CloudProviderException>(
            () => AzureResourceGraphService.ValidatePage(document.RootElement));
    }

    [Fact]
    public void TruncatedPageWithContinuationIsAccepted()
    {
        using var document = JsonDocument.Parse("{\"data\":[],\"resultTruncated\":true,\"$skipToken\":\"next\"}");
        Assert.Equal("next", AzureResourceGraphService.ValidatePage(document.RootElement).SkipToken);
    }
}
