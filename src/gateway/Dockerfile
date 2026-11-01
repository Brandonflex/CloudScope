# Experimental single-instance gateway + loopback API. Build context: repository root.
FROM node:20-bookworm-slim AS gateway-build
WORKDIR /gateway
COPY src/gateway/package*.json ./
RUN npm ci --omit=dev
COPY src/gateway/*.mjs ./

FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS api-build
WORKDIR /src
COPY src/server/ ./server/
COPY src/client/public/demo/inventory.json ./client/public/demo/inventory.json
RUN dotnet publish server/CloudScope.Api/CloudScope.Api.csproj --configuration Release --output /publish -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim
COPY --from=gateway-build /usr/local/bin/node /usr/local/bin/node
COPY --from=gateway-build /gateway /app/gateway
COPY --from=api-build /publish /app/api
WORKDIR /app
USER $APP_UID
ENV DOTNET_RUNNING_IN_CONTAINER=true
EXPOSE 10000
CMD ["node", "/app/gateway/supervisor.mjs"]
