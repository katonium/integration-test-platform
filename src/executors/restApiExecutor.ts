import axios, { AxiosResponse } from 'axios';
import { RESTApiParams, TestContext, TestResult } from '../types';
import { AssertionEngine } from '../assertionEngine';

export class RESTApiExecutor {
  private context: TestContext;

  constructor(context: TestContext) {
    this.context = context;
  }

  public async execute(stepName: string, stepId: string | undefined, params: RESTApiParams): Promise<TestResult> {
    try {
      const { request, responseAssertion } = params;
      
      // Resolve URL variables
      const url = this.resolveVariables(request.url);
      
      // Prepare headers
      const headers: any = {};
      if (request.headers) {
        for (const header of request.headers) {
          if (typeof header === 'string') {
            const [key, value] = header.split(': ');
            if (key && value) {
              headers[key] = this.resolveVariables(value);
            } else {
              // Handle format like "content-type: application/json"
              const parts = header.split(':');
              if (parts.length === 2) {
                headers[parts[0].trim()] = this.resolveVariables(parts[1].trim());
              }
            }
          }
        }
      }

      // Prepare request body
      let body = request.body;
      if (body && typeof body === 'object') {
        body = this.resolveObjectVariables(body);
      }

      // Make HTTP request
      const response: AxiosResponse = await axios({
        method: request.method,
        url: url,
        headers: headers,
        data: body,
        validateStatus: () => true // Don't throw on non-2xx status codes
      });

      const responseData = {
        status: response.status,
        headers: response.headers,
        data: response.data
      };

      // Store result in context if stepId is provided
      if (stepId) {
        this.context.stepResults.set(stepId, {
          response: responseData,
          status: response.status,
          headers: response.headers,
          data: response.data
        });
      }

      // Evaluate assertions if provided
      let assertions: any[] = [];
      if (responseAssertion) {
        const assertionEngine = new AssertionEngine(this.context);
        
        // Prepare actual values for assertion
        const actualValue: any = {};
        
        if (responseAssertion.status !== undefined) {
          actualValue.status = response.status;
        }
        
        if (responseAssertion.headers) {
          actualValue.headers = {};
          for (const headerAssertion of responseAssertion.headers) {
            if (typeof headerAssertion === 'string') {
              const [headerName, assertion] = headerAssertion.split(': ');
              if (headerName && assertion) {
                actualValue.headers[headerName] = response.headers[headerName.toLowerCase()];
              }
            }
          }
        }
        
        if (responseAssertion.body) {
          actualValue.body = response.data;
        }
        
        assertions = assertionEngine.evaluateAssertions(responseAssertion, actualValue);
      }

      const success = assertions.length === 0 || assertions.every(a => a.passed);

      return {
        stepName,
        stepId,
        success,
        response: responseData,
        assertions
      };

    } catch (error) {
      return {
        stepName,
        stepId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private resolveVariables(text: string): string {
    if (typeof text !== 'string') {
      return text;
    }

    // Handle template strings like {baseUrl} or {testCaseId}
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      const value = this.getVariableValue(varName);
      return value !== undefined ? String(value) : match;
    });
  }

  private resolveObjectVariables(obj: any): any {
    if (typeof obj === 'string') {
      return this.resolveVariables(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObjectVariables(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const resolved: any = {};
      for (const key in obj) {
        resolved[key] = this.resolveObjectVariables(obj[key]);
      }
      return resolved;
    }
    return obj;
  }

  private getVariableValue(path: string): any {
    // Check context variables first
    if (this.context.variables.has(path)) {
      return this.context.variables.get(path);
    }

    // Check step results
    const parts = path.split('.');
    if (parts.length > 1) {
      const stepId = parts[0];
      if (this.context.stepResults.has(stepId)) {
        const stepResult = this.context.stepResults.get(stepId);
        let value = stepResult;
        
        for (let i = 1; i < parts.length; i++) {
          if (value && typeof value === 'object') {
            value = value[parts[i]];
          } else {
            return undefined;
          }
        }
        return value;
      }
    }

    // Check built-in variables
    switch (path) {
      case 'baseUrl':
        return this.context.baseUrl;
      case 'testCaseId':
        return this.context.testCaseId;
      default:
        return undefined;
    }
  }
}