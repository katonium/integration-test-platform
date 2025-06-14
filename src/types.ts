export interface TestCase {
  kind: 'TestCase';
  version: string;
  name: string;
  step: TestStep[];
}

export interface TestStep {
  name: string;
  id?: string;
  kind: 'PostgreSQL' | 'RESTApiExecution';
  params: PostgreSQLParams | RESTApiParams;
  responseAssertion?: any;
}

export interface PostgreSQLParams {
  query?: string;
  fromFile?: string;
}

export interface RESTApiParams {
  request: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: string[];
    body?: any;
  };
  responseAssertion?: {
    status?: number;
    headers?: string[];
    body?: any;
  };
}

export interface TestContext {
  variables: Map<string, any>;
  stepResults: Map<string, any>;
  baseUrl?: string;
  testCaseId?: string;
}

export interface TestResult {
  stepName: string;
  stepId?: string;
  success: boolean;
  error?: string;
  response?: any;
  assertions?: AssertionResult[];
}

export interface AssertionResult {
  field: string;
  expected: any;
  actual: any;
  passed: boolean;
  message?: string;
}

export interface TestEngineConfig {
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  baseUrl?: string;
  testCaseId?: string;
}