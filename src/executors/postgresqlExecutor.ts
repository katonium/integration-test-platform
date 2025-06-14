import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { PostgreSQLParams, TestContext, TestResult } from '../types';
import { AssertionEngine } from '../assertionEngine';

export class PostgreSQLExecutor {
  private client: Client;
  private context: TestContext;

  constructor(client: Client, context: TestContext) {
    this.client = client;
    this.context = context;
  }

  public async execute(stepName: string, stepId: string | undefined, params: PostgreSQLParams, responseAssertion?: any): Promise<TestResult> {
    try {
      let query: string;

      if (params.query) {
        query = this.resolveVariables(params.query);
      } else if (params.fromFile) {
        const filePath = path.resolve(params.fromFile);
        if (!fs.existsSync(filePath)) {
          throw new Error(`SQL file not found: ${filePath}`);
        }
        query = fs.readFileSync(filePath, 'utf-8');
        query = this.resolveVariables(query);
      } else {
        throw new Error('Either query or fromFile must be specified');
      }

      const result = await this.client.query(query);
      
      const response = {
        rows: result.rows,
        rowCount: result.rowCount,
        command: result.command
      };

      // Store result in context if stepId is provided
      if (stepId) {
        this.context.stepResults.set(stepId, {
          response: response,
          rows: result.rows,
          rowCount: result.rowCount
        });
      }

      // Evaluate assertions if provided
      let assertions: any[] = [];
      if (responseAssertion) {
        const assertionEngine = new AssertionEngine(this.context);
        
        // For PostgreSQL, we typically assert against the first row or row count
        let actualValue: any;
        if (responseAssertion.count !== undefined) {
          actualValue = { count: result.rowCount };
        } else {
          actualValue = result.rows.length > 0 ? result.rows[0] : {};
        }
        
        assertions = assertionEngine.evaluateAssertions(responseAssertion, actualValue);
      }

      const success = assertions.length === 0 || assertions.every(a => a.passed);

      return {
        stepName,
        stepId,
        success,
        response,
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
    // Handle template strings like {baseUrl} or {testCaseId}
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      const value = this.getVariableValue(varName);
      return value !== undefined ? String(value) : match;
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