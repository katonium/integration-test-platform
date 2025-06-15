export interface TestResult {
  testCaseId: string;
  testCaseName: string;
  steps: StepResult[];
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  kind: string;
  success: boolean;
  output: any;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export abstract class BaseReporter {
  public abstract reportTestStart(testCaseId: string, testCaseName: string): Promise<void>;
  public abstract reportStepStart(stepId: string, stepName: string, kind: string): Promise<void>;
  public abstract reportStepEnd(stepId: string, success: boolean, output: any): Promise<void>;
  public abstract reportTestEnd(testCaseId: string, success: boolean): Promise<void>;
  public abstract generateReport(): Promise<void>;
}