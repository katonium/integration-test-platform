import { BaseAction, ActionResult, StepDefinition } from './BaseAction';



/**
 * RestApiCallAction class that extends BaseAction to perform REST API calls.
 * 
 * This class call REST API and validates the response.
 * 
 * example step definition:
 * ```yaml
 * - action: RestApiCall
 *   name: Call REST API
 *   parameters:
 *     url: https://api.example.com/data
 *     method: GET
 *     headers:
 *       Authorization: Bearer YOUR_API_KEY
 *       Content-Type: application/json
 *     queryParams:
 *       param1: value1
 *       param2: value2
 *     body:
 *       key1: 'value1'
 *       key2: 'value2'
 *   responseValidation:
 *     statusCode: 200
 *     body:
 *       key1: 'value1'
 *       key2: 'value2'
 *     headers:
 *       Content-Type: application/json
 */
export class RestApiCallAction extends BaseAction {
  public async execute(step: StepDefinition): Promise<ActionResult> {
    try {
      // Validate step definition
      const validation = this.validateStepDefinition(step);
      if (!validation.success) {
        return {
          success: false,
          output: { error: 'Validation failed', details: validation.errors }
        };
      }

      const { url, method = 'GET', headers = {}, queryParams = {}, body } = step.params;

      // Build URL with query parameters
      const urlObj = new URL(url);
      Object.entries(queryParams).forEach(([key, value]) => {
        urlObj.searchParams.append(key, String(value));
      });

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      // Add body for non-GET requests
      if (body && method.toUpperCase() !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      // Make the API call
      const response = await fetch(urlObj.toString(), fetchOptions);
      
      // Parse response
      let responseBody: any;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Convert headers to plain object
      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      const result = {
        status: response.status,
        statusText: response.statusText,
        headers: headerObj,
        body: responseBody
      };

      // Validate response if responseValidation is provided
      if (step.params.responseValidation) {
        const validationResult = this.validateResponse(result, step.params.responseValidation);
        if (!validationResult.success) {
          return {
            success: false,
            output: {
              error: 'Response validation failed',
              validationErrors: validationResult.errors,
              response: result
            }
          };
        }
      }

      return {
        success: true,
        output: { response: result }
      };
    } catch (error) {
      return {
        success: false,
        output: {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  private validateStepDefinition(step: StepDefinition): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!step.params) {
      errors.push('Parameters are required');
      return { success: false, errors };
    }

    if (!step.params.url) {
      errors.push('URL is required');
    }

    if (step.params.method && typeof step.params.method !== 'string') {
      errors.push('Method must be a string');
    }

    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (step.params.method && !allowedMethods.includes(step.params.method.toUpperCase())) {
      errors.push(`Method must be one of: ${allowedMethods.join(', ')}`);
    }

    return { success: errors.length === 0, errors };
  }

  private validateResponse(response: any, validation: any): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate status code
    if (validation.statusCode && response.status !== validation.statusCode) {
      errors.push(`Expected status code ${validation.statusCode}, got ${response.status}`);
    }

    // Validate headers
    if (validation.headers) {
      Object.entries(validation.headers).forEach(([key, expectedValue]) => {
        const actualValue = response.headers[key.toLowerCase()];
        if (expectedValue !== actualValue) {
          errors.push(`Expected header ${key}: ${expectedValue}, got: ${actualValue}`);
        }
      });
    }

    // Validate body
    if (validation.body) {
      const bodyErrors = this.validateObject(response.body, validation.body, 'body');
      errors.push(...bodyErrors);
    }

    return { success: errors.length === 0, errors };
  }

  private validateObject(actual: any, expected: any, path: string): string[] {
    const errors: string[] = [];

    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      Object.entries(expected).forEach(([key, expectedValue]) => {
        const actualValue = actual?.[key];
        const currentPath = `${path}.${key}`;

        if (typeof expectedValue === 'object' && expectedValue !== null && !Array.isArray(expectedValue)) {
          errors.push(...this.validateObject(actualValue, expectedValue, currentPath));
        } else if (actualValue !== expectedValue) {
          errors.push(`Expected ${currentPath}: ${expectedValue}, got: ${actualValue}`);
        }
      });
    } else if (actual !== expected) {
      errors.push(`Expected ${path}: ${expected}, got: ${actual}`);
    }

    return errors;
  }
}