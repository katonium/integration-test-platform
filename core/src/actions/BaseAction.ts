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
  depends_on?: string[];
}

export abstract class BaseAction {
  public abstract execute(step: StepDefinition): Promise<ActionResult>;
}