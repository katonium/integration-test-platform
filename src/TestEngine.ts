import * as YAML from 'yamljs';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BaseAction, StepDefinition, ActionResult } from './actions/BaseAction';
import { EchoAction } from './actions/EchoAction';
import { NopAction } from './actions/NopAction';
import { FailAction } from './actions/FailAction';
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

  constructor(reporter: BaseReporter, configPath?: string) {
    this.reporter = reporter;
    this.actions = new Map();
    this.registerDefaultActions();
    
    if (configPath) {
      Config.load(configPath);
    }
  }

  private registerDefaultActions(): void {
    this.actions.set('Echo', new EchoAction());
    this.actions.set('Nop', new NopAction());
    this.actions.set('Fail', new FailAction());
  }

  public registerAction(kind: string, action: BaseAction): void {
    this.actions.set(kind, action);
  }

  public async executeTestCase(yamlFilePath: string, context: Partial<ExecutionContext> = {}): Promise<boolean> {
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const testCase: TestCase = YAML.parse(yamlContent);

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
      
      await this.reporter.reportStepStart(processedStep.id, processedStep.name, processedStep.kind);

      const action = this.actions.get(processedStep.kind);
      if (!action) {
        throw new Error(`Unknown action kind: ${processedStep.kind}`);
      }

      try {
        const result = await action.execute(processedStep);
        stepResults.set(processedStep.id, result);
        
        await this.reporter.reportStepEnd(processedStep.id, result.success, result.output);

        if (!result.success) {
          testSuccess = false;
          break;
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
        break;
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

  public async generateReport(): Promise<void> {
    await this.reporter.generateReport();
  }
}