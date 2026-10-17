namespace CloudScope.Core.Common;

/// <summary>
/// A generic result type for operations that can succeed or fail.
/// </summary>
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }
    public List<string> Errors { get; } = new();

    private Result(T? value, bool isSuccess, string? error)
    {
        Value = value;
        IsSuccess = isSuccess;
        Error = error;
    }

    public static Result<T> Success(T value) => new(value, true, null);
    public static Result<T> Failure(string error) => new(default, false, error);
    public static Result<T> Failure(List<string> errors) => new(default, false, string.Join("; ", errors))
    {
        Errors = errors
    };
}

/// <summary>
/// Non-generic result for void operations.
/// </summary>
public class Result
{
    public bool IsSuccess { get; }
    public string? Error { get; }

    private Result(bool isSuccess, string? error)
    {
        IsSuccess = isSuccess;
        Error = error;
    }

    public static Result Success() => new(true, null);
    public static Result Failure(string error) => new(false, error);
}