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
- `{stepId.response.field}`: Reference output from a previous step
- `{stepId.response.data.users[0].name}`: Reference to an array element

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
```

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
- **Docker**: Report server
