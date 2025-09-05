import { BaseAction, ActionResult, StepDefinition } from './base-action';

export class EchoAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    return {
      success: true,
      output: {
        echo: step.params || {},
        status: 'OK'
      }
    };
  }
}