# Integration Test Platform

A YAML-based test workflow execution engine implemented in TypeScript.

## Overview

This platform provides the following features:

- Execution of test cases written in YAML
- Extensible action system
- Sharing of output data between steps
- Configuration management and template variable functionality
- Allure report generation
- Report viewing with Docker

## Architecture

### Core Components

#### TestEngine
- Parses and executes YAML test cases
- Manages and executes actions
- Variable substitution and context management

#### Actions
- `BaseAction`: Abstract class with a unified interface
- `EchoAction`: Action that returns the input as output
- `NopAction`: Action that always succeeds  
- `FailAction`: Action that always fails
- `RestApiCallAction`: Performs REST API calls with validation
- `PostgreSQLAction`: Executes PostgreSQL queries and transactions

#### Reporters
- `BaseReporter`: Abstract class for reporting
- `AllureReporter`: Allure report generation functionality

#### Config
- Loads YAML configuration files
- Overrides settings via environment variables
- `Config.get("key.subKey")` interface

## Setup

### Install dependencies

```bash
npm install
```

### TypeScript compilation

```bash
npm run build
```

## Usage

### Running tests

```bash
# Run all test files (default: test-cases/)
npm test

# Run a specific file
npm test test-cases/echo-sample.yaml

# Run multiple files
npm test test-cases/echo-sample.yaml test-cases/failure-sample.yaml

# Run all tests in a specific directory
npm test test-cases/

# Combine multiple directories and files
npm test test-cases/echo-sample.yaml test-cases/subfolder/
```

### Configuration file

Define base settings in `config.yaml`:

```yaml
baseUrl: "http://localhost:8080"
database:
  host: "localhost"
  port: 5432
  name: "testdb"
api:
  timeout: 30000
  retries: 3
```

### Override settings with environment variables

```bash
DATABASE_HOST=test-db npm test
```

## Writing Test Cases

### Basic Structure

```yaml
kind: TestCase
version: "1.1"
name: Sample Test Case
step:
  - name: Initialize test data
    id: init_data
    kind: Echo
    params:
      message: "Test initialization"
      data:
        users:
          - name: "Taro Yamada"
            email: "yamada@example.com"
```

### Variable Substitution

- `{testCaseId}`: Unique ID of the test case
- `{testCaseName}`: Name of the test case
- `{stepId.output.result.field}`: Reference output from a previous step
- `{stepId.output.result.rows[0].id}`: Reference to array elements in results

### Conditional Execution

Control step execution based on test status using the `if` condition:

- `if: always()`: Execute regardless of test status (for cleanup steps)
- `if: success()`: Execute only when test is currently successful
- `if: failure()`: Execute only when test has failed
- No `if` condition: Defaults to `success()` behavior

```yaml
- name: Setup step
  kind: Echo
  params:
    message: "Setup"
  # No if condition = success() behavior

- name: Main test
  id: main-test
  kind: RestApiCall
  if: success()
  params:
    url: "http://api.example.com/test"

- name: Cleanup on failure
  kind: PostgreSQL
  if: failure()
  params:
    query: "DELETE FROM temp_data WHERE test_id = $1"
    values: ["{testCaseId}"]

- name: Always cleanup
  kind: Echo
  if: always()
  params:
    message: "Test completed"
```

### Available Actions

#### Echo
Returns the input parameters as output.

```yaml
- name: Echo test
  kind: Echo
  params:
    message: "Hello World"
    data: { key: "value" }
```

#### Nop
Action that always succeeds. Used for status checks.

```yaml
- name: Success operation
  kind: Nop
```

#### Fail
Action that always fails. Used for error handling tests.

```yaml
- name: Failure test
  kind: Fail
  params:
    message: "Intentional failure"
```

#### RestApiCall
Performs REST API calls with request/response validation.

```yaml
- name: Call REST API
  kind: RestApiCall
  params:
    url: "http://localhost:8080/api/users"
    method: POST
    headers:
      Content-Type: application/json
      Authorization: "Bearer token"
    queryParams:
      limit: 10
    body:
      name: "John Doe"
      email: "john@example.com"
  responseValidation:
    statusCode: 201
    headers:
      Content-Type: application/json
    body:
      id: 123
      name: "John Doe"
```

#### PostgreSQL
Executes PostgreSQL queries and transactions.

```yaml
# Single query
- name: Insert user
  kind: PostgreSQL
  params:
    query: "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id"
    values:
      - "John Doe"
      - "john@example.com"
  responseValidation:
    rowsAffected: 1

# Multiple queries (transaction)
- name: Create user and order
  kind: PostgreSQL
  params:
    queries:
      - query: "INSERT INTO users (name) VALUES ($1) RETURNING id"
        values: ["John Doe"]
      - query: "INSERT INTO orders (user_id, product) VALUES ($1, $2)"
        values: ["{prev.result.rows[0].id}", "Laptop"]
  responseValidation:
    rowsAffected: 2
```

## Allure Report

### Report Generation

After running tests, results in JSON format are output to the `./allure-results` directory.

### Viewing Reports

Start the Allure report server using Docker:

```bash
# Build Docker image
docker build -t allure-serve ./allure

# Start the report server
docker run -p 8080:8080 -v $(pwd)/allure-results:/app/allure-results allure-serve
```

You can view the report at http://localhost:8080.

### Single HTML Report

Generate a single HTML file containing all report assets:

```bash
# Build the Allure generator image
docker build -t allure-generator ./allure

# Generate single HTML report
docker run --rm \
  -v "$(pwd)/allure-results:/app/allure-results" \
  -v "$(pwd)/allure-report:/app/allure-report" \
  allure-generator generate

# The report will be in allure-report/index.html
```

## Directory Structure

```
src/
├── actions/           # Action implementations
│   ├── BaseAction.ts
│   ├── EchoAction.ts
│   ├── NopAction.ts
│   └── FailAction.ts
├── reporters/         # Reporter implementations
│   ├── BaseReporter.ts
│   └── AllureReporter.ts
├── Config.ts          # Configuration management
├── TestEngine.ts      # Main engine
└── test-runner.ts     # Test runner script

test-cases/            # Test cases
├── echo-sample.yaml
└── failure-sample.yaml

allure/                # Allure server
├── Dockerfile
└── entrypoint.sh

config.yaml            # Configuration file
allure-results/        # Test results
docker-compose.yml     # Docker services
init-db.sql           # Database initialization
tools/                # Additional tools
├── echo-server/      # Go echo server
│   ├── main.go
│   └── Dockerfile
```

## Docker Environment

### Services

Start the complete testing environment:

```bash
# Start PostgreSQL and echo server
docker-compose up -d

# Check services are running
docker ps
```

**Available services:**
- **PostgreSQL**: Database server on port 5432
- **Echo Server**: REST API echo server on port 8080

### Configuration

Database connection settings in `config.yaml`:

```yaml
actions:
  postgresql:
    host: localhost
    port: 5432
    database: testdb
    schema: test_schema
    user: test_app_user
    password: app_password
```

## CI/CD Pipeline

GitHub Actions workflow provides:

- **Automated Testing**: Runs integration tests on every push/PR
- **Docker Environment**: Builds and starts all services
- **Allure Reports**: Generates single HTML reports
- **GitHub Pages**: Deploys reports automatically
- **Artifact Upload**: Test results and HTML reports

View the workflow in `.github/workflows/ci.yml`.

## How to Extend

### Adding Custom Actions

1. Create a class that extends `BaseAction`
2. Implement the `execute` method
3. Register the action in `TestEngine`

```typescript
export class CustomAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    // Custom logic
    return {
      success: true,
      output: { status: 'OK' }
    };
  }
}

// Registration
engine.registerAction('Custom', new CustomAction());
```

### Adding Custom Reporters

1. Create a class that extends `BaseReporter`
2. Implement the required methods

```typescript
export class CustomReporter extends BaseReporter {
  public async reportTestStart(testCaseId: string, testCaseName: string): Promise<void> {
    // Custom report processing
  }
  // Implement other methods as needed
}
```

## Tech Stack

- **TypeScript**: Main development language
- **yamljs**: YAML parsing
- **allure-js-commons**: Test report generation
- **uuid**: Unique ID generation
- **pg**: PostgreSQL client
- **Docker**: Containerization and services
- **Go**: Echo server implementation
- **GitHub Actions**: CI/CD pipeline
