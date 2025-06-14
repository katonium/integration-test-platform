import { Client } from 'pg';
import * as YAML from 'yamljs';
import * as fs from 'fs';
import chalk from 'chalk';
import { TestCase, TestContext, TestResult, TestEngineConfig, PostgreSQLParams, RESTApiParams } from './types';
import { PostgreSQLExecutor } from './executors/postgresqlExecutor';
import { RESTApiExecutor } from './executors/restApiExecutor';

export class TestEngine {
  private config: TestEngineConfig;
  private context: TestContext;
  private pgClient?: Client;

  constructor(config: TestEngineConfig) {
    this.config = config;
    this.context = {
      variables: new Map(),
      stepResults: new Map(),
      baseUrl: config.baseUrl,
      testCaseId: config.testCaseId
    };
  }

  public async initialize(): Promise<void> {
    // Initialize PostgreSQL connection if configured
    console.log(chalk.green('🔌 Initializing Test Engine...'));
    if (this.config.postgresql) {
      this.pgClient = new Client(this.config.postgresql);
      await this.pgClient.connect();
      console.log(chalk.green('✓ Connected to PostgreSQL'));
    }
  }

  public async cleanup(): Promise<void> {
    if (this.pgClient) {
      await this.pgClient.end();
      console.log(chalk.gray('PostgreSQL connection closed'));
    }
  }

  public async runTestFile(filePath: string): Promise<boolean> {
    try {
      console.log(chalk.blue(`\n🧪 Loading test case: ${filePath}`));

      if (!fs.existsSync(filePath)) {
        throw new Error(`Test file not found: ${filePath}`);
      }

      const yamlContent = fs.readFileSync(filePath, 'utf-8');
      const testCase: TestCase = YAML.parse(yamlContent);

      return await this.runTestCase(testCase);

    } catch (error) {
      console.error(chalk.red(`❌ Failed to load test case: ${error instanceof Error ? error.message : String(error)}`));
      return false;
    }
  }

  public async runTestCase(testCase: TestCase): Promise<boolean> {
    console.log(chalk.blue(`\n📋 Running test case: ${testCase.name}`));
    console.log(chalk.gray(`   Version: ${testCase.version}`));
    console.log(chalk.gray(`   Steps: ${testCase.step.length}`));

    let allStepsPassed = true;
    const results: TestResult[] = [];

    for (let i = 0; i < testCase.step.length; i++) {
      const step = testCase.step[i];
      console.log(chalk.cyan(`\n📝 Step ${i + 1}: ${step.name}`));

      let result: TestResult;

      try {
        if (step.kind === 'PostgreSQL') {
          if (!this.pgClient) {
            await this.initialize();
            if (!this.pgClient) {
              throw new Error('PostgreSQL not configured');
            }
          }
          const executor = new PostgreSQLExecutor(this.pgClient, this.context);
          result = await executor.execute(step.name, step.id, step.params as PostgreSQLParams, step.responseAssertion);
        } else if (step.kind === 'RESTApiExecution') {
          const executor = new RESTApiExecutor(this.context);
          result = await executor.execute(step.name, step.id, step.params as RESTApiParams);
        } else {
          throw new Error(`Unsupported step kind: ${step.kind}`);
        }

        results.push(result);

        if (result.success) {
          console.log(chalk.green(`   ✓ ${result.stepName}`));
          
          // Print assertion results if any
          if (result.assertions && result.assertions.length > 0) {
            for (const assertion of result.assertions) {
              if (assertion.passed) {
                console.log(chalk.green(`     ✓ ${assertion.field}: ${assertion.expected} === ${assertion.actual}`));
              } else {
                console.log(chalk.red(`     ✗ ${assertion.field}: ${assertion.message}`));
              }
            }
          }

          // Print response summary
          if (result.response) {
            if (step.kind === 'PostgreSQL') {
              console.log(chalk.gray(`     Rows affected: ${result.response.rowCount || 0}`));
            } else if (step.kind === 'RESTApiExecution') {
              console.log(chalk.gray(`     HTTP Status: ${result.response.status}`));
            }
          }
        } else {
          console.log(chalk.red(`   ✗ ${result.stepName}`));
          if (result.error) {
            console.log(chalk.red(`     Error: ${result.error}`));
          }
          
          // Print failed assertions
          if (result.assertions) {
            for (const assertion of result.assertions) {
              if (!assertion.passed) {
                console.log(chalk.red(`     ✗ ${assertion.field}: ${assertion.message}`));
              }
            }
          }
          
          allStepsPassed = false;
        }

      } catch (error) {
        result = {
          stepName: step.name,
          stepId: step.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(result);
        
        console.log(chalk.red(`   ✗ ${step.name}`));
        console.log(chalk.red(`     Error: ${result.error}`));
        allStepsPassed = false;
      }
    }

    // Print summary
    console.log(chalk.blue('\n📊 Test Summary:'));
    const passedSteps = results.filter(r => r.success).length;
    const totalSteps = results.length;

    if (allStepsPassed) {
      console.log(chalk.green(`✅ All ${totalSteps} steps passed`));
    } else {
      console.log(chalk.red(`❌ ${passedSteps}/${totalSteps} steps passed`));
    }

    return allStepsPassed;
  }
}