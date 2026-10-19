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
    private const int MaxQuestionLength = 1000;

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
    [RequestSizeLimit(16 * 1024)]
    public async Task<IActionResult> Ask([FromBody] QueryRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return BadRequest(new { message = "Question is required" });

        if (request.Question.Length > MaxQuestionLength)
            return BadRequest(new { message = $"Question must be {MaxQuestionLength} characters or fewer" });

        // Truncated so an oversized-but-allowed question cannot bloat the logs.
        _logger.LogInformation("AI query received: {Question}", request.Question.Length > 200
            ? request.Question[..200] + "…"
            : request.Question);

        var result = await _aiQueryService.QueryAsync(request.Question, ct);

        // Project to a UI-friendly shape: TimeSpan would otherwise serialize as
        // "00:00:00.0120000", which is noise in the chat transcript.
        var payload = new
        {
            question = result.Question,
            answer = result.Answer,
            generatedQuery = result.GeneratedQuery,
            data = result.Data,
            success = result.Success,
            error = result.Error,
            processingTime = $"{result.ProcessingTime.TotalMilliseconds:0} ms",
            source = result.Source
        };

        return result.Success ? Ok(payload) : StatusCode(500, payload);
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