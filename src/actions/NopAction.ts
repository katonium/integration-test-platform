import { BaseAction, ActionResult, StepDefinition } from './BaseAction';

export class NopAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    return {
      success: true,
      output: {
        status: 'OK'
      }
    };
  }
}