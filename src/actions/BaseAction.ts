export interface ActionResult {
  success: boolean;
  output: any;
}

export interface StepDefinition {
  name: string;
  id: string;
  kind: string;
  params?: any;
}

export abstract class BaseAction {
  public abstract execute(step: StepDefinition): Promise<ActionResult>;
}