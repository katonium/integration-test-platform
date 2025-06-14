import { AssertionResult, TestContext } from './types';

export class AssertionEngine {
  private context: TestContext;

  constructor(context: TestContext) {
    this.context = context;
  }

  public evaluateAssertions(expected: any, actual: any): AssertionResult[] {
    const results: AssertionResult[] = [];
    this.compareValues('', expected, actual, results);
    return results;
  }

  private compareValues(path: string, expected: any, actual: any, results: AssertionResult[]): void {
    if (Array.isArray(expected)) {
      this.handleArrayAssertion(path, expected, actual, results);
    } else if (typeof expected === 'object' && expected !== null) {
      this.handleObjectAssertion(path, expected, actual, results);
    } else {
      this.handlePrimitiveAssertion(path, expected, actual, results);
    }
  }

  private handleArrayAssertion(path: string, expected: any[], actual: any, results: AssertionResult[]): void {
    if (expected.length === 1 && typeof expected[0] === 'string') {
      // Special assertion syntax like [shouldNotBeNull]
      const assertion = expected[0];
      const passed = this.evaluateSpecialAssertion(assertion, actual);
      results.push({
        field: path,
        expected: assertion,
        actual: actual,
        passed: passed,
        message: passed ? undefined : `Assertion '${assertion}' failed for value: ${actual}`
      });
    } else {
      // Regular array comparison
      if (!Array.isArray(actual)) {
        results.push({
          field: path,
          expected: expected,
          actual: actual,
          passed: false,
          message: 'Expected array but got different type'
        });
        return;
      }
      
      for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
        const itemPath = path ? `${path}[${i}]` : `[${i}]`;
        this.compareValues(itemPath, expected[i], actual[i], results);
      }
    }
  }

  private handleObjectAssertion(path: string, expected: any, actual: any, results: AssertionResult[]): void {
    if (typeof actual !== 'object' || actual === null) {
      results.push({
        field: path,
        expected: expected,
        actual: actual,
        passed: false,
        message: 'Expected object but got different type'
      });
      return;
    }

    for (const key in expected) {
      const fieldPath = path ? `${path}.${key}` : key;
      this.compareValues(fieldPath, expected[key], actual[key], results);
    }
  }

  private handlePrimitiveAssertion(path: string, expected: any, actual: any, results: AssertionResult[]): void {
    // Handle variable substitution
    const resolvedExpected = this.resolveVariables(expected);
    const passed = resolvedExpected === actual;
    
    results.push({
      field: path,
      expected: resolvedExpected,
      actual: actual,
      passed: passed,
      message: passed ? undefined : `Expected '${resolvedExpected}' but got '${actual}'`
    });
  }

  private evaluateSpecialAssertion(assertion: string, actual: any): boolean {
    switch (assertion) {
      case 'shouldNotBeNull':
        return actual !== null && actual !== undefined;
      case 'shouldBeNull':
        return actual === null || actual === undefined;
      case 'shouldBeEmpty':
        return actual === '' || (Array.isArray(actual) && actual.length === 0);
      case 'shouldNotBeEmpty':
        return actual !== '' && (!Array.isArray(actual) || actual.length > 0);
      default:
        return false;
    }
  }

  private resolveVariables(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    // Handle variable references like [api_execution.response.status]
    const variableMatch = value.match(/^\[(.+)\]$/);
    if (variableMatch) {
      const variablePath = variableMatch[1];
      return this.getVariableValue(variablePath);
    }

    // Handle template strings like {baseUrl} or {testCaseId}
    return value.replace(/\{([^}]+)\}/g, (match, varName) => {
      return this.getVariableValue(varName) || match;
    });
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