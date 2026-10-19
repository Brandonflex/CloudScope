using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// API endpoints for AI-powered natural language queries.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class QueryController : ControllerBase
{
    private readonly IAIQueryService _aiQueryService;
    private readonly ILogger<QueryController> _logger;

    public QueryController(IAIQueryService aiQueryService, ILogger<QueryController> logger)
    {
        _aiQueryService = aiQueryService;
        _logger = logger;
    }

    /// <summary>
    /// Ask a natural language question about your cloud infrastructure.
    /// </summary>
    [HttpPost("ask")]
    public async Task<IActionResult> Ask([FromBody] QueryRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return BadRequest(new { message = "Question is required" });

        _logger.LogInformation("AI query received: {Question}", request.Question);

        var result = await _aiQueryService.QueryAsync(request.Question, ct);

        return result.Success ? Ok(result) : StatusCode(500, result);
    }

    /// <summary>
    /// Get suggested queries based on current resource inventory.
    /// </summary>
    [HttpGet("suggestions")]
    public async Task<IActionResult> GetSuggestions(CancellationToken ct)
    {
        var suggestions = await _aiQueryService.GetSuggestionsAsync(ct);
        return Ok(suggestions);
    }
}

/// <summary>
/// Request body for the AI query endpoint.
/// </summary>
public record QueryRequest(string Question);