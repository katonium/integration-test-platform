# Integration Test Platform

**ALWAYS reference these instructions first** and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

This is a YAML-based integration test platform written in TypeScript that executes test workflows against PostgreSQL databases and REST APIs. The platform generates Allure reports and supports conditional execution, variable substitution, and complex test orchestration.

## Working Effectively

### Bootstrap and Build
Run these commands in exact order - NEVER CANCEL long-running operations:

```bash
# Navigate to repository root
cd /home/runner/work/integration-test-platform/integration-test-platform

# Install core dependencies - takes 5 seconds
cd core && npm install

# Install example dependencies - takes 2 seconds  
cd ../example && npm install

# Build TypeScript (core) - takes 2 seconds
cd ../core && npm run build

# Build TypeScript (example) - takes 2 seconds
cd ../example && npm run build
```

**CRITICAL TIMING**: Total bootstrap time is ~11 seconds. Set timeout to 60+ seconds for safety.

### Start Required Services
The platform requires PostgreSQL and an Echo server for REST API testing:

```bash
cd /home/runner/work/integration-test-platform/integration-test-platform/example

# Start PostgreSQL and Echo server - takes 2 seconds (cached), 10 seconds (initial build)
# NEVER CANCEL: Initial Docker build may take 10+ seconds for echo server
docker compose up -d

# Verify services are ready - takes 1-2 seconds
docker exec test-postgres pg_isready -U testuser -d testdb
curl -X POST http://localhost:8080/test -H "Content-Type: application/json" -d '{"test": "ready"}'
```

**Service Details:**
- **PostgreSQL**: Port 5432, database `testdb`, user `testuser`, password `testpass`
- **Echo Server**: Port 8080, Go-based REST API that echoes requests

### Run Tests
Always run from the `/example` directory:

```bash
cd /home/runner/work/integration-test-platform/integration-test-platform/example

# Run single test file - takes 2 seconds
npm test test-cases/success-sample.yaml

# Run multiple test files - takes 2 seconds  
npm test test-cases/success-sample.yaml test-cases/echo-sample.yaml

# Run all working test files - takes 2 seconds
npm test test-cases/success-sample.yaml test-cases/echo-sample.yaml test-cases/success-conditional-test.yaml test-cases/depends-on-parallel.yaml test-cases/depends-on-sequential.yaml
```

**NEVER CANCEL**: Test execution is fast (under 3 seconds), but set timeout to 30+ seconds to be safe.

### Allure Report Generation
Test results are automatically saved to `./allure-results` as JSON files after each test run.

**Docker Report Generation** (currently has networking issues in sandboxed environments):
```bash
# Build Allure Docker image - may fail due to networking timeouts
docker build -t allure-generator ./allure

# Generate single HTML report - only works if build succeeds
docker run --rm \
  -v "$(pwd)/allure-results:/app/allure-results" \
  -v "$(pwd)/allure-report:/app/allure-report" \
  allure-generator generate
```

## Validation Scenarios

**CRITICAL**: Always test these complete workflows after making changes:

### 1. Basic Integration Test Workflow
```bash
# Start services
docker compose up -d

# Verify PostgreSQL connection
docker exec test-postgres psql -U testuser -d testdb -c "SELECT current_database();"

# Verify Echo server
curl -X POST http://localhost:8080/echo -H "Content-Type: application/json" -d '{"message": "test"}'

# Run full integration test
npm test test-cases/success-sample.yaml

# Verify test creates database records, calls REST API, and cleans up
```

### 2. Conditional Execution Test
```bash
# Test failure handling and conditional steps
npm test test-cases/conditional-test.yaml

# Verify: 
# - Success steps execute when tests pass
# - Failure steps execute when tests fail  
# - Always steps execute regardless of test status
# - Default behavior is success() condition
```

### 3. Multi-Test Execution
```bash
# Run multiple tests to verify proper isolation
npm test test-cases/success-sample.yaml test-cases/echo-sample.yaml test-cases/success-conditional-test.yaml

# Verify all tests complete and generate separate Allure result files
ls allure-results/*.json | wc -l  # Should show multiple JSON files
```

## Common Issues and Workarounds

### Docker Build Failures
The original echo server Dockerfile fails in sandboxed environments due to Alpine package manager networking issues.

**Workaround**: Use the fixed Dockerfile:
```bash
# Use Dockerfile-fixed instead of Dockerfile for echo server
# This uses distroless base image instead of Alpine
```

### Allure Docker Build Issues
The Allure Docker container fails to build due to Amazon Corretto repository timeouts.

**Workaround**: JSON results are still generated correctly in `./allure-results` even without Docker reports.

### Service Startup Verification
Always verify services before running tests:
```bash
# PostgreSQL ready check
docker exec test-postgres pg_isready -U testuser -d testdb

# Echo server ready check  
curl -f http://localhost:8080/test 2>/dev/null || curl -f http://localhost:8080/ 2>/dev/null
```

## Repository Structure

### Key Directories
- **`/core`**: Core test engine and action implementations
- **`/example`**: Example usage, test cases, and Docker services
- **`/example/test-cases`**: YAML test case definitions
- **`/example/tools/echo-server`**: Go-based REST API server for testing
- **`/example/allure`**: Allure report generation Docker setup

### Important Files
- **`example/package.json`**: Main test runner scripts (`npm test`, `npm run build`)
- **`example/config.yaml`**: Test platform configuration (database, API settings)
- **`example/docker-compose.yml`**: PostgreSQL and Echo server services
- **`example/init-db.sql`**: Database schema initialization
- **`.github/workflows/ci.yml`**: Complete CI pipeline reference

### Build Outputs
- **`core/dist/`**: Compiled TypeScript for core module
- **`example/dist/`**: Compiled TypeScript for example module  
- **`example/allure-results/`**: JSON test results for Allure reporting

## Technology Stack

- **TypeScript/Node.js**: Main development platform (Node.js v20.19.4+)
- **PostgreSQL 15**: Database for integration testing
- **Go**: Echo server implementation  
- **Docker/Docker Compose**: Service orchestration
- **Allure**: Test reporting and visualization
- **YAML**: Test case definition format

## Test Case Development

### Action Types Available
- **Echo**: Returns input parameters as output (for testing data flow)
- **Nop**: Always succeeds (for testing conditional logic)
- **Fail**: Always fails (for testing error handling)
- **RestApiCall**: HTTP requests with validation
- **PostgreSQL**: Database queries and transactions

### Variable Substitution
- `{testCaseId}`: Unique test case identifier
- `{testCaseName}`: Human-readable test name
- `{stepId.output.field}`: Reference previous step outputs
- `{stepId.output.result.rows[0].id}`: Array element access

### Conditional Execution
- `if: always()`: Execute regardless of test status
- `if: success()`: Execute only when test is successful (default)
- `if: failure()`: Execute only when test has failed
- No `if` condition: Defaults to `success()` behavior

## Dependencies and Requirements

### Required Tools
- **Node.js 18+**: Runtime and package management
- **Docker**: Container services  
- **Docker Compose**: Multi-service orchestration

### Optional Tools
- **Go 1.21+**: For echo server development (containerized alternative available)
- **Task**: Build automation (install via `docs/install-task.sh`)

Always build and validate your changes using the exact commands and timing expectations documented above.