import * as YAML from 'yamljs';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BaseAction, StepDefinition, ActionResult } from './actions/BaseAction';
import { BaseReporter } from './reporters/BaseReporter';
import { Config } from './Config';

export interface TestCase {
  kind: string;
  version: string;
  name: string;
  step: StepDefinition[];
}

export interface ExecutionContext {
  testCaseId: string;
  testCaseName: string;
  [key: string]: any;
}

export class TestEngine {
  private actions: Map<string, BaseAction>;
  private reporter: BaseReporter;

  constructor(reporter: BaseReporter) {
    this.reporter = reporter;
    this.actions = new Map();
  }

  public registerAction(kind: string, action: BaseAction): void {
    this.actions.set(kind, action);
  }

  public async executeTestCase(yamlFilePath: string, context: Partial<ExecutionContext> = {}): Promise<boolean> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const testCase: TestCase = YAML.parse(yamlContent);

    // Validate if conditions before starting the test
    this.validateIfConditions(testCase);

    const executionContext: ExecutionContext = {
      testCaseId: context.testCaseId || uuidv4(),
      testCaseName: testCase.name,
      ...context
    };

    const stepResults: Map<string, ActionResult> = new Map();
    let testSuccess = true;

    await this.reporter.reportTestStart(executionContext.testCaseId, executionContext.testCaseName);

    for (const step of testCase.step) {
      const processedStep = this.processStepVariables(step, executionContext, stepResults);
      
      // Evaluate if condition
      if (!this.shouldExecuteStep(processedStep, testSuccess)) {
        const reason = processedStep.if ? `Condition: ${processedStep.if}` : 'Condition: success() (default)';
        console.log(`  Step ${processedStep.id} (${processedStep.kind}): SKIPPED (${reason})`);
        await this.reporter.reportStepSkipped(processedStep.id, processedStep.name, processedStep.kind, reason);
        continue;
      }
      
      await this.reporter.reportStepStart(processedStep.id, processedStep.name, processedStep.kind);

      const action = this.actions.get(processedStep.kind);
      if (!action) {
        throw new Error(`Unknown action kind: ${processedStep.kind}`);
      }

      try {
        const result = await action.execute(processedStep);
        stepResults.set(processedStep.id, result);
        
        // Debug logging
        console.log(`  Step ${processedStep.id} (${processedStep.kind}): ${result.success ? 'SUCCESS' : 'FAILED'}`);
        if (!result.success) {
          console.log(`    Error: ${JSON.stringify(result.output, null, 2)}`);
        } else {
          console.log(`    Result structure: ${JSON.stringify(result.output, null, 2)}`);
        }
        
        await this.reporter.reportStepEnd(processedStep.id, result.success, result.output);

        if (!result.success) {
          testSuccess = false;
          // Don't break here anymore - let remaining steps with if conditions execute
        }
      } catch (error) {
        const errorResult: ActionResult = {
          success: false,
          output: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          }
        };
        stepResults.set(processedStep.id, errorResult);
        await this.reporter.reportStepEnd(processedStep.id, false, errorResult.output);
        testSuccess = false;
        // Don't break here anymore - let remaining steps with if conditions execute
      }
    }

    await this.reporter.reportTestEnd(executionContext.testCaseId, testSuccess);
    return testSuccess;
  }

  private processStepVariables(
    step: StepDefinition,
    context: ExecutionContext,
    stepResults: Map<string, ActionResult>
  ): StepDefinition {
    const processedStep = JSON.parse(JSON.stringify(step));
    
    const replaceVariables = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.replace(/\{([^}]+)\}/g, (match, variable) => {
          if (variable === 'testCaseId') return context.testCaseId;
          if (variable === 'testCaseName') return context.testCaseName;
          
          const [stepId, ...path] = variable.split('.');
          if (stepResults.has(stepId)) {
            const result = stepResults.get(stepId)!;
            if (path.length === 0) return JSON.stringify(result);
            
            let value: any = result;
            for (const key of path) {
              if (key.includes('[') && key.includes(']')) {
                const [arrayKey, indexStr] = key.split('[');
                const index = parseInt(indexStr.replace(']', ''));
                value = value[arrayKey]?.[index];
              } else {
                value = value[key];
              }
              if (value === undefined) break;
            }
            return value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : match;
          }
          
          return match;
        });
      } else if (Array.isArray(obj)) {
        return obj.map(replaceVariables);
      } else if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = replaceVariables(value);
        }
        return result;
      }
      return obj;
    };

    return replaceVariables(processedStep);
  }

  public async executeTestStep(step: StepDefinition): Promise<ActionResult> {
    const action = this.actions.get(step.kind);
    if (!action) {
      throw new Error(`Unknown action kind: ${step.kind}`);
    }

    try {
      const result = await action.execute(step);
      return result;
    } catch (error) {
      return {
        success: false,
        output: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  private validateIfConditions(testCase: TestCase): void {
    const validConditions = ['always()', 'success()', 'failure()'];
    
    for (const step of testCase.step) {
      if (step.if) {
        const condition = step.if.toLowerCase().trim();
        if (!validConditions.includes(condition)) {
          throw new Error(`Invalid if condition '${step.if}' in step '${step.id}'. Valid conditions are: ${validConditions.join(', ')}`);
        }
      }
    }
  }

  private shouldExecuteStep(step: StepDefinition, currentTestSuccess: boolean): boolean {
    // If no condition specified, treat as success() (only execute if test is currently successful)
    if (!step.if) {
      return currentTestSuccess;
    }

    const condition = step.if.toLowerCase().trim();
    
    switch (condition) {
      case 'always()':
        return true;
      case 'success()':
        return currentTestSuccess;
      case 'failure()':
        return !currentTestSuccess;
      default:
        // This should never happen due to validation, but just in case
        throw new Error(`Invalid condition: ${step.if}`);
    }
  }

  public async generateReport(): Promise<void> {
    await this.reporter.generateReport();
  }
}