# syntax=docker/dockerfile:1
# CloudScope API — multi-stage build (context: src/server)

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore against the project files first so the layer caches on code changes.
COPY CloudScope.sln ./
COPY CloudScope.Api/CloudScope.Api.csproj CloudScope.Api/
COPY CloudScope.Core/CloudScope.Core.csproj CloudScope.Core/
COPY CloudScope.Infrastructure/CloudScope.Infrastructure.csproj CloudScope.Infrastructure/
COPY CloudScope.GraphEngine/CloudScope.GraphEngine.csproj CloudScope.GraphEngine/
COPY CloudScope.Tests/CloudScope.Tests.csproj CloudScope.Tests/
RUN dotnet restore CloudScope.Api/CloudScope.Api.csproj

COPY . .
RUN dotnet publish CloudScope.Api/CloudScope.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

COPY --from=build /app/publish .
RUN useradd --create-home --uid 1000 cloudscope \
    && chown -R cloudscope:cloudscope /app
USER cloudscope

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "CloudScope.Api.dll"]
