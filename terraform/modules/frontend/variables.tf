variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "genai-chatbot"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "frontend_build_dir" {
  description = "Directory containing the frontend build files"
  type        = string
  default     = "../../frontend/build"
}
