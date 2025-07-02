export interface ActionResult {
  success: boolean;
  output: any;
}

export interface StepDefinition {
  name: string;
  id: string;
  kind: string;
  params?: any;
  if?: string;
}

export abstract class BaseAction {
  public abstract execute(step: StepDefinition): Promise<ActionResult>;
}