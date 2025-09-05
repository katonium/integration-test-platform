import { BaseAction } from './actions/base-action';

export class ActionRegistry {
  private static instance: ActionRegistry | null = null;
  private actions: Map<string, BaseAction> = new Map();

  private constructor() {}

  public static getInstance(): ActionRegistry {
    if (!ActionRegistry.instance) {
      ActionRegistry.instance = new ActionRegistry();
    }
    return ActionRegistry.instance;
  }

  public static register(kind: string, action: BaseAction, force: boolean = false): void {
    const instance = ActionRegistry.getInstance();
    
    if (instance.actions.has(kind) && !force) {
      throw new Error(`Action with kind '${kind}' is already registered. Use force=true to override.`);
    }
    
    instance.actions.set(kind, action);
  }

  public static get(kind: string): BaseAction | undefined {
    const instance = ActionRegistry.getInstance();
    return instance.actions.get(kind);
  }

  public static has(kind: string): boolean {
    const instance = ActionRegistry.getInstance();
    return instance.actions.has(kind);
  }

  public static getAll(): Map<string, BaseAction> {
    const instance = ActionRegistry.getInstance();
    return new Map(instance.actions);
  }
}