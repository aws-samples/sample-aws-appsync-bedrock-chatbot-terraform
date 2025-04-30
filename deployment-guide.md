# Deployment Guide

This project uses Terraform to manage all infrastructure resources, including Lambda functions, AppSync API, and DynamoDB tables.

## Deployment Process

The deployment process has been simplified to use Terraform exclusively for all infrastructure updates, ensuring consistent state management and proper versioning of all resources.

### Deploying Changes

To deploy changes to both infrastructure and Lambda functions, use the `apply-changes.sh` script:

```bash
# Standard deployment
./apply-changes.sh

# Deployment with frontend rebuild
./apply-changes.sh --build
```

#### Options:

- `--build`: Builds the frontend application before starting it. Use this option when you've made changes to the frontend code that require a rebuild.

### What the Script Does:

1. Applies Terraform changes to update all infrastructure resources
2. Updates the frontend configuration (if applicable)
3. Optionally builds the frontend application
4. Restarts the frontend application

### Frontend-Only Updates

If you only need to restart the frontend application without deploying infrastructure changes:

```bash
./restart-frontend.sh
```

## Development Workflow

1. Make changes to your infrastructure code in the `terraform/` directory
2. Make changes to your Lambda function code in the `src/functions/` directory
3. Run `./apply-changes.sh` to deploy all changes
4. Test your changes

## Benefits of Terraform-Only Approach

- **Consistent state management**: Terraform tracks the state of all resources
- **Complete infrastructure as code**: All resources are defined and versioned in your Terraform files
- **Atomic deployments**: Changes to related resources are deployed together
- **Better auditability**: All changes go through the same deployment process
