import { StepDefinition, ActionResult } from './actions/BaseAction';
import { BaseReporter } from './reporters/BaseReporter';
import { ActionRegistry } from './ActionRegistry';

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

export enum StepStatus {
  PENDING = 'pending',
  ENQUEUED = 'enqueued', 
  RUNNING = 'running',
  FINISHED = 'finished',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface StepState {
  status: StepStatus;
  result?: ActionResult;
}

export class TestEngine {
  private reporter: BaseReporter;

  constructor(reporter: BaseReporter) {
    this.reporter = reporter;
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

  public async executeTestStep(executionContext: ExecutionContext, stepId: string): Promise<ActionResult> {
    const { testCase, stepResults, testSuccess } = executionContext;
    const step = testCase.step.find((s: StepDefinition) => s.id === stepId);
    if (!step) throw new Error(`Step with id ${stepId} not found`);
    const processedStep = this.processStepVariables(step, executionContext, stepResults);

    // Evaluate if condition
    if (!this.shouldExecuteStep(processedStep, executionContext.testSuccess)) {
      const reason = processedStep.if ? `Condition: ${processedStep.if}` : 'Condition: success() (default)';
      console.log(`  Step ${processedStep.id} (${processedStep.kind}): SKIPPED (${reason})`);
      await this.reporter.reportStepSkipped(processedStep.id, processedStep.name, processedStep.kind, reason);
      return { success: true, output: 'SKIPPED' };
    }

    await this.reporter.reportStepStart(processedStep.id, processedStep.name, processedStep.kind);
    const action = ActionRegistry.get(processedStep.kind);
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
      if (!result.success) executionContext.testSuccess = false;
      return result;
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
      executionContext.testSuccess = false;
      return errorResult;
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

  private validateDependencies(testCase: TestCase): void {
    // Validate unique step IDs
    const stepIds = new Set<string>();
    const duplicateIds = new Set<string>();
    
    for (const step of testCase.step) {
      if (stepIds.has(step.id)) {
        duplicateIds.add(step.id);
      }
      stepIds.add(step.id);
    }
    
    if (duplicateIds.size > 0) {
      throw new Error(`Duplicate step IDs found: ${Array.from(duplicateIds).join(', ')}`);
    }
    
    // Validate dependencies using order-based rules
    const stepIdToIndex = new Map<string, number>();
    testCase.step.forEach((step, index) => {
      stepIdToIndex.set(step.id, index);
    });
    
    for (let i = 0; i < testCase.step.length; i++) {
      const step = testCase.step[i];
      if (step.depends_on) {
        for (const dependency of step.depends_on) {
          // Check if dependency exists
          if (!stepIdToIndex.has(dependency)) {
            throw new Error(`Step '${step.id}' depends on non-existent step '${dependency}'`);
          }
          
          // Check if dependency is defined above current step (order-based validation)
          const dependencyIndex = stepIdToIndex.get(dependency)!;
          if (dependencyIndex >= i) {
            throw new Error(`Step '${step.id}' cannot depend on step '${dependency}' because dependencies must be defined above the current step`);
          }
        }
      }
    }
  }

  private canExecuteStep(step: StepDefinition, stepStates: Map<string, StepState>): boolean {
    if (!step.depends_on || step.depends_on.length === 0) {
      return true;
    }

    for (const dependency of step.depends_on) {
      const depState = stepStates.get(dependency);
      if (!depState || depState.status !== StepStatus.FINISHED) {
        return false;
      }
      // Note: We allow execution even if dependency failed - the step will be marked as failed during execution
    }

    return true;
  }

  public async executeTestCase(testCase: TestCase, executionContext: ExecutionContext): Promise<boolean> {
    // Validate dependencies and unique IDs (order-based validation prevents circular dependencies)
    this.validateDependencies(testCase);
    this.validateIfConditions(testCase);

    const stepStates = new Map<string, StepState>();
    const stepResults = new Map<string, ActionResult>();
    
    // Initialize all steps as pending
    testCase.step.forEach(step => {
      stepStates.set(step.id, { status: StepStatus.PENDING });
    });

    // Update execution context
    executionContext.testCase = testCase;
    executionContext.stepResults = stepResults;
    
    // Check if any steps have dependencies
    const hasStepsWithDependencies = testCase.step.some(step => step.depends_on && step.depends_on.length > 0);
    
    if (!hasStepsWithDependencies) {
      // No dependencies - use sequential execution for full backward compatibility
      return await this.executeStepsSequentially(testCase, executionContext, stepStates, stepResults);
    }

    // Has dependencies - use parallel execution with dependency management
    return await this.executeStepsWithDependencies(testCase, executionContext, stepStates, stepResults);
  }

  private async executeStepsSequentially(
    testCase: TestCase, 
    executionContext: ExecutionContext, 
    stepStates: Map<string, StepState>, 
    stepResults: Map<string, ActionResult>
  ): Promise<boolean> {
    let overallTestSuccess = true;
    
    for (const step of testCase.step) {
      try {
        const result = await this.executeTestStep(executionContext, step.id);
        stepStates.set(step.id, { status: result.success ? StepStatus.FINISHED : StepStatus.FAILED, result });
        if (!result.success) {
          overallTestSuccess = false;
          executionContext.testSuccess = false;
        }
      } catch (error) {
        const errorResult: ActionResult = {
          success: false,
          output: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          }
        };
        stepStates.set(step.id, { status: StepStatus.FAILED, result: errorResult });
        stepResults.set(step.id, errorResult);
        overallTestSuccess = false;
        executionContext.testSuccess = false;
      }
    }
    return overallTestSuccess;
  }

  private async executeStepsWithDependencies(
    testCase: TestCase, 
    executionContext: ExecutionContext, 
    stepStates: Map<string, StepState>, 
    stepResults: Map<string, ActionResult>
  ): Promise<boolean> {
    let overallTestSuccess = true;
    const executingSteps = new Set<string>();
    let allStepsCompleted = false;

    while (!allStepsCompleted) {
      const readySteps = testCase.step.filter(step => {
        const state = stepStates.get(step.id)!;
        return state.status === StepStatus.PENDING && 
               this.canExecuteStep(step, stepStates) &&
               !executingSteps.has(step.id);
      });

      // If no steps are ready and none are running, we're done
      if (readySteps.length === 0 && executingSteps.size === 0) {
        allStepsCompleted = true;
        continue;
      }

      // Start execution of ready steps in parallel
      const stepPromises = readySteps.map(async (step) => {
        executingSteps.add(step.id);
        stepStates.set(step.id, { status: StepStatus.RUNNING });

        try {
          // Check dependencies one more time for failed dependencies
          if (step.depends_on) {
            for (const dependency of step.depends_on) {
              const depState = stepStates.get(dependency);
              if (depState?.result && !depState.result.success) {
                // Mark this step as failed due to dependency failure
                const failureResult: ActionResult = {
                  success: false,
                  output: { error: `Dependency '${dependency}' failed` }
                };
                stepStates.set(step.id, { status: StepStatus.FAILED, result: failureResult });
                stepResults.set(step.id, failureResult);
                await this.reporter.reportStepEnd(step.id, false, failureResult.output);
                overallTestSuccess = false;
                executionContext.testSuccess = false;  // Update execution context for conditional logic
                return;
              }
            }
          }

          // Use the existing executeTestStep method which handles conditional logic
          const result = await this.executeTestStep(executionContext, step.id);
          const status = result.success ? StepStatus.FINISHED : StepStatus.FAILED;
          stepStates.set(step.id, { status, result });
          
          if (!result.success) {
            overallTestSuccess = false;
            executionContext.testSuccess = false;  // Update execution context for conditional logic
          }
        } catch (error) {
          const errorResult: ActionResult = {
            success: false,
            output: {
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined
            }
          };
          stepStates.set(step.id, { status: StepStatus.FAILED, result: errorResult });
          stepResults.set(step.id, errorResult);
          overallTestSuccess = false;
          executionContext.testSuccess = false;  // Update execution context for conditional logic
        } finally {
          executingSteps.delete(step.id);
        }
      });

      // Wait for at least one step to complete before checking for more ready steps
      if (stepPromises.length > 0) {
        await Promise.race(stepPromises);
      } else {
        // If no steps started, wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return overallTestSuccess;
  }
}