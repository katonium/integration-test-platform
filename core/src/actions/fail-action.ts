import { BaseAction, ActionResult, StepDefinition } from './base-action';

export class FailAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    return {
      success: false,
      output: {
        error: 'Intentional failure',
        message: step.params?.message || 'Step failed as expected',
        status: 'FAILED'
      }
    };
  }
}