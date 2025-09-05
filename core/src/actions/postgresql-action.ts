import { BaseAction, ActionResult, StepDefinition } from './base-action';
import { Config } from '../config';
const { Client } = require('pg');

/**
 * PostgreSQLAction class that extends BaseAction to perform PostgreSQL database operations.
 *
 * This class interacts with a PostgreSQL database and validates the response.
 *
 * NOTE: responseValidation is optional and can be used to validate the results of last executed query.
 *
 * example step definitions:
 * 
 * example1: selecting data from PostgreSQL
 * ```yaml
 * - action: PostgreSQLAction
 *   name: Execute PostgreSQL Query
 *   parameters:
 *     query: SELECT * FROM users WHERE id = $1
 *     values:
 *       - 123
 *   responseValidation:
 *   - name: Bob
 *     age: 30
 *   - name: Alice
 *     age: 25
 * ```
 * 
 * example2: inserting data into PostgreSQL
 * ```yaml
 * - action: PostgreSQLAction
 *   name: Insert into PostgreSQL
 *   parameters:
 *     query: INSERT INTO users (name, age) VALUES ($1, $2)
 *     values:
 *       - 'Charlie'
 *       - 28
 *   responseValidation:
 *     rowsAffected: 1
 * ```
 * 
 * example3: multiple queries in a transaction
 * ```yaml
 * - action: PostgreSQLAction
 *   name: Transaction Example
 *   parameters:
 *     queries:
 *       - query: INSERT INTO users (name, age) VALUES ($1, $2)
 *         values:
 *           - 'David'
 *           - 35
 *       - query: UPDATE users SET age = $1 WHERE name = $2
 *         values:
 *           - 36
 *           - 'David'
 *   responseValidation:
 *     rowsAffected: 2
 * ```
 */
export class PostgreSQLAction extends BaseAction {
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

      const client = new Client({
        host: Config.get('actions.postgresql.host'),
        port: parseInt(Config.get('actions.postgresql.port')),
        database: Config.get('actions.postgresql.database'),
        schema: Config.get('actions.postgresql.schema'),
        user: Config.get('actions.postgresql.user'),
        password: Config.get('actions.postgresql.password'),
      });

      await client.connect();

      let result: any;
      let totalRowsAffected = 0;
      let lastQueryResult: any;

      try {
        // Handle single query
        if (step.params.query) {
          const queryResult = await client.query(step.params.query, step.params.values || []);
          result = {
            rows: queryResult.rows,
            rowCount: queryResult.rowCount,
            command: queryResult.command
          };
          lastQueryResult = result;
          totalRowsAffected = queryResult.rowCount || 0;
        }
        // Handle multiple queries (transaction)
        else if (step.params.queries && Array.isArray(step.params.queries)) {
          await client.query('BEGIN');
          const results: any[] = [];
          
          for (const queryObj of step.params.queries) {
            const queryResult = await client.query(queryObj.query, queryObj.values || []);
            const formattedResult = {
              rows: queryResult.rows,
              rowCount: queryResult.rowCount,
              command: queryResult.command
            };
            results.push(formattedResult);
            lastQueryResult = formattedResult; // Keep track of last query result
            totalRowsAffected += queryResult.rowCount || 0;
          }
          
          await client.query('COMMIT');
          result = {
            queries: results,
            totalRowsAffected,
            lastQuery: lastQueryResult
          };
        }
        else {
          throw new Error('Either query or queries parameter is required');
        }

        // Validate response if responseValidation is provided
        // For multiple queries, validate against the last query result
        if (step.params.responseValidation) {
          const validationTarget = step.params.queries ? lastQueryResult : result;
          const validationResult = this.validateResponse(validationTarget, step.params.responseValidation, totalRowsAffected);
          if (!validationResult.success) {
            return {
              success: false,
              output: {
                error: 'Response validation failed',
                validationErrors: validationResult.errors,
                result
              }
            };
          }
        }

        return {
          success: true,
          output: { result }
        };

      } catch (queryError) {
        // Rollback transaction if it was started
        if (step.params.queries) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            // Ignore rollback errors
          }
        }
        throw queryError;
      } finally {
        await client.end();
      }

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

    // Check if either query or queries is provided
    if (!step.params.query && !step.params.queries) {
      errors.push('Either query or queries parameter is required');
    }

    // Validate single query
    if (step.params.query && typeof step.params.query !== 'string') {
      errors.push('Query must be a string');
    }

    // Validate multiple queries
    if (step.params.queries) {
      if (!Array.isArray(step.params.queries)) {
        errors.push('Queries must be an array');
      } else {
        step.params.queries.forEach((queryObj: any, index: number) => {
          if (!queryObj.query || typeof queryObj.query !== 'string') {
            errors.push(`Query at index ${index} must have a valid query string`);
          }
        });
      }
    }

    // Validate values if provided
    if (step.params.values && !Array.isArray(step.params.values)) {
      errors.push('Values must be an array');
    }

    return { success: errors.length === 0, errors };
  }

  private validateResponse(result: any, validation: any, totalRowsAffected?: number): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate rowsAffected
    if (validation.rowsAffected !== undefined) {
      const actualRowsAffected = totalRowsAffected !== undefined 
        ? totalRowsAffected 
        : result.rowCount;
      
      if (actualRowsAffected !== validation.rowsAffected) {
        errors.push(`Expected rowsAffected: ${validation.rowsAffected}, got: ${actualRowsAffected}`);
      }
    }

    // Validate result rows for SELECT queries
    if (Array.isArray(validation) && result.rows) {
      if (result.rows.length !== validation.length) {
        errors.push(`Expected ${validation.length} rows, got ${result.rows.length}`);
      } else {
        validation.forEach((expectedRow: any, index: number) => {
          const actualRow = result.rows[index];
          const rowErrors = this.validateObject(actualRow, expectedRow, `row[${index}]`);
          errors.push(...rowErrors);
        });
      }
    }

    // Validate object properties
    if (typeof validation === 'object' && !Array.isArray(validation) && validation.rowsAffected === undefined) {
      const objectErrors = this.validateObject(result, validation, 'result');
      errors.push(...objectErrors);
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