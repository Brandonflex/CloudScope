# CloudScope — AWS Infrastructure (Terraform)
# Manages AWS-side resources: S3 state storage, Config, Cost Explorer access

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3 (recommended for teams)
  # backend "s3" {
  #   bucket         = "cloudscope-terraform-state"
  #   key            = "aws/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "cloudscope-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "CloudScope"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ─── Variables ─────────────────────────────────────────────
variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

# ─── S3 Bucket for CloudScope reports and artifacts ────────
resource "aws_s3_bucket" "cloudscope_reports" {
  bucket = "cloudscope-${var.environment}-reports"

  tags = {
    Name = "CloudScope Reports"
  }
}

resource "aws_s3_bucket_versioning" "reports_versioning" {
  bucket = aws_s3_bucket.cloudscope_reports.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports_encryption" {
  bucket = aws_s3_bucket.cloudscope_reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "reports_pab" {
  bucket = aws_s3_bucket.cloudscope_reports.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── AWS Config (for resource discovery) ───────────────────
resource "aws_config_configuration_recorder" "cloudscope" {
  name     = "cloudscope-recorder"
  role_arn = aws_iam_role.config_role.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "cloudscope" {
  name           = "cloudscope-delivery"
  s3_bucket_name = aws_s3_bucket.cloudscope_reports.bucket
}

resource "aws_iam_role" "config_role" {
  name = "cloudscope-config-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "config_policy" {
  role       = aws_iam_role.config_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

# ─── IAM User for CloudScope API (read-only access) ───────
resource "aws_iam_user" "cloudscope_api" {
  name = "cloudscope-api-${var.environment}"
}

resource "aws_iam_user_policy" "cloudscope_readonly" {
  name = "cloudscope-readonly-${var.environment}"
  user = aws_iam_user.cloudscope_api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowConfigRead"
        Effect = "Allow"
        Action = [
          "config:SelectResourceConfig",
          "config:ListDiscoveredResources",
          "config:GetResourceConfigHistory",
          "config:BatchGetResourceConfig"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowCostExplorer"
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetCostForecast",
          "ce:GetDimensionValues",
          "ce:GetAnomalies",
          "ce:GetAnomalyMonitors"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowResourceExplorer"
        Effect = "Allow"
        Action = [
          "resource-explorer-2:Search",
          "resource-explorer-2:ListViews",
          "resource-explorer-2:GetView"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowReadOnly"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "rds:Describe*",
          "s3:GetBucketLocation",
          "s3:ListAllMyBuckets",
          "lambda:ListFunctions",
          "elasticloadbalancing:Describe*",
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
          "eks:ListClusters",
          "eks:DescribeCluster",
          "dynamodb:ListTables",
          "dynamodb:DescribeTable"
        ]
        Resource = "*"
      }
    ]
  })
}

# ─── Outputs ──────────────────────────────────────────────
output "reports_bucket_name" {
  value = aws_s3_bucket.cloudscope_reports.bucket
}

output "api_user_name" {
  value = aws_iam_user.cloudscope_api.name
}

output "config_recorder_name" {
  value = aws_config_configuration_recorder.cloudscope.name
}