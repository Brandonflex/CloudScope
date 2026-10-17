# Contributing to CloudScope

Thank you for your interest in contributing to CloudScope! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create** a feature branch from `main`
4. **Make** your changes
5. **Test** your changes thoroughly
6. **Submit** a pull request

## Development Setup

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 20+](https://nodejs.org/) with npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (for Azure integration testing)
- [AWS CLI](https://aws.amazon.com/cli/) (for AWS integration testing)

### Running Locally

```bash
# Start infrastructure services
docker-compose up -d

# Backend
cd src/server
dotnet restore
dotnet run --project CloudScope.Api

# Frontend (separate terminal)
cd src/client
npm install
ng serve
```

## Branch Naming Convention

- `feature/description` — New features
- `fix/description` — Bug fixes
- `refactor/description` — Code refactoring
- `docs/description` — Documentation updates
- `build/description` — Build/infrastructure changes

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add blast radius visualization
fix: correct cost calculation for reserved instances
docs: update architecture diagrams
refactor: extract graph traversal into separate service
test: add unit tests for resource discovery
```

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Include a clear description of what changed and why
- Add screenshots for UI changes
- Ensure all tests pass
- Update documentation if needed
- Link related issues

## Code Style

### C# / .NET
- Follow [Microsoft C# Coding Conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- Use file-scoped namespaces
- Prefer records for DTOs
- Use async/await consistently

### TypeScript / Angular
- Follow the [Angular Style Guide](https://angular.io/guide/styleguide)
- Use standalone components
- Prefer signals for reactive state
- Use lazy loading for feature modules

## Testing

- Write unit tests for all new business logic
- Write integration tests for API endpoints
- Aim for >80% code coverage on new code
- Run the full test suite before submitting PRs

```bash
# .NET tests
cd src/server && dotnet test

# Angular tests
cd src/client && ng test
```

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce for bugs
- Include your environment details (OS, .NET version, Node version)

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great.

## Questions?

Open a GitHub Discussion if you have questions about contributing.