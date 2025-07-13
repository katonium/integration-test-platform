
export class Config {
  private static instance: Config | null = null;
  private config: any = {};

  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  public static load(config: any): void {
    const instance = Config.getInstance();

    // if config has already been loaded, abort
    if (instance.config && Object.keys(instance.config).length > 0) {
      throw new Error('Configuration has already been loaded. Use Config.reset() to clear the current configuration.');
    }

    if (typeof config === 'object' && config !== null) {
      instance.config = config;
    } else {
      throw new Error('Invalid configuration object');
    }
  }

  public static get(key: string): any {
    const instance = Config.getInstance();
    
    // Check environment variable first
    const envKey = key.toUpperCase().replace('.', '_');
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      return envValue;
    }

    // Get value from config
    const keys = key.split('.');
    let value = instance.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  public static set(key: string, value: any): void {
    const instance = Config.getInstance();
    const keys = key.split('.');
    let current = instance.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  public static reset(): void {
    const instance = Config.getInstance();
    instance.config = {};
  }
}