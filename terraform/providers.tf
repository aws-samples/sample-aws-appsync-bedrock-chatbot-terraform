terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.97.0" # Updated from 5.31.0 to latest stable version with Bedrock Knowledge Base support
    }
  }
  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
}
