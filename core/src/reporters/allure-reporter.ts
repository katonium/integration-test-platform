import { BaseReporter } from './base-reporter';
import { TestResult, StepResult, Status, StatusDetails } from 'allure-js-commons';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class AllureReporter extends BaseReporter {
  private outputDir: string;
  private currentTest: TestResult | null = null;
  private currentSteps: StepResult[] = [];

  constructor(outputDir: string = './allure-results') {
    super();
    this.outputDir = outputDir;

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public async reportTestStart(testCaseId: string, testCaseName: string): Promise<void> {
    this.currentTest = {
      uuid: uuidv4(),
      historyId: testCaseId,
      name: testCaseName,
      fullName: testCaseId,
      start: Date.now(),
      status: Status.PASSED,
      stage: 'running' as any,
      steps: [],
      attachments: [],
      parameters: [],
      labels: [],
      links: [],
      statusDetails: {} as StatusDetails
    };
    this.currentSteps = [];
  }

  public async reportStepStart(stepId: string, stepName: string, kind: string): Promise<void> {
    const step: StepResult = {
      name: stepName,
      start: Date.now(),
      status: Status.PASSED,
      stage: 'running' as any,
      steps: [],
      attachments: [],
      parameters: [],
      statusDetails: {} as StatusDetails
    };
    this.currentSteps.push(step);
  }

  public async reportStepEnd(stepId: string, success: boolean, output: any): Promise<void> {
    const step = this.currentSteps[this.currentSteps.length - 1];
    if (step) {
      step.stop = Date.now();
      step.status = success ? Status.PASSED : Status.FAILED;
      step.stage = 'finished' as any;
      
      if (!success) {
        step.statusDetails = {
          message: output.error || 'Step failed',
          trace: JSON.stringify(output, null, 2)
        };
      }
    }
  }

  public async reportStepSkipped(stepId: string, stepName: string, kind: string, reason: string): Promise<void> {
    const step: StepResult = {
      name: stepName,
      start: Date.now(),
      stop: Date.now(),
      status: Status.SKIPPED,
      stage: 'finished' as any,
      steps: [],
      attachments: [],
      parameters: [
        {
          name: 'Skip Reason',
          value: reason
        },
        {
          name: 'Action Kind',
          value: kind
        }
      ],
      statusDetails: {
        message: `Step skipped: ${reason}`
      }
    };

    this.currentSteps.push(step);
  }

  public async reportTestEnd(testCaseId: string, success: boolean): Promise<void> {
    if (this.currentTest) {
      this.currentTest.stop = Date.now();
      this.currentTest.status = success ? Status.PASSED : Status.FAILED;
      this.currentTest.stage = 'finished' as any;
      this.currentTest.steps = this.currentSteps;
      
      if (!success) {
        this.currentTest.statusDetails = {
          message: 'Test case failed',
          trace: ''
        };
      }

      const filename = `${this.currentTest.uuid}-result.json`;
      const filePath = path.join(this.outputDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(this.currentTest, null, 2), 'utf8');
      
      this.currentTest = null;
      this.currentSteps = [];
    }
  }

  public async generateReport(): Promise<void> {
    console.log(`Allure results saved to: ${this.outputDir}`);
  }
}