import { BaseAction } from './actions/BaseAction';

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

  public static register(key: string, action: BaseAction, force: boolean = false): void {
    const instance = ActionRegistry.getInstance();
    
    if (instance.actions.has(key) && !force) {
      throw new Error(`Action with key '${key}' is already registered. Use force=true to override.`);
    }
    
    instance.actions.set(key, action);
  }

  public static get(key: string): BaseAction | undefined {
    const instance = ActionRegistry.getInstance();
    return instance.actions.get(key);
  }
}