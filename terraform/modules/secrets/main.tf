resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.project_name}-${var.environment}-jwt-secret"
  description = "Secret key for JWT token signing"
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret_version" "jwt_secret_value" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = jsonencode({
    jwtSecret = var.jwt_secret != null ? var.jwt_secret : random_password.jwt_secret.result
  })
}
