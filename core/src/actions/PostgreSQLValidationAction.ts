import { BaseAction, ActionResult, StepDefinition } from './BaseAction';
import { Config } from '../Config';
const { Client } = require('pg');

/**
 * PostgreSQLValidationAction class that extends BaseAction to perform simplified PostgreSQL validation.
 * 
 * This action automatically builds SQL queries from validation conditions and verifies data existence.
 * It retrieves table schema information and constructs appropriate WHERE clauses for each condition.
 * 
 * Special values:
 * - [null]: Checks for NULL values using IS NULL
 * - [!null]: Checks for NOT NULL values using IS NOT NULL
 * 
 * Example step definition:
 * ```yaml
 * - action: PostgreSQLValidation
 *   name: Validate Users Table
 *   parameters:
 *     table: users
 *   responseValidation:
 *     - name: Bob
 *       age: 30
 *     - name: Alice
 *       age: 25
 *     - name: Tom
 *       age: [null]
 *     - name: [!null]
 *       age: 54
 * ```
 * 
 * This will execute 4 queries:
 * 1. SELECT * FROM users WHERE name = 'Bob' AND age = 30;
 * 2. SELECT * FROM users WHERE name = 'Alice' AND age = 25;
 * 3. SELECT * FROM users WHERE name = 'Tom' AND age IS NULL;
 * 4. SELECT * FROM users WHERE name IS NOT NULL AND age = 54;
 */
export class PostgreSQLValidationAction extends BaseAction {
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

      try {
        const tableName = step.params.table;
        const validationConditions = step.params.responseValidation;

        // Get table schema information
        const tableSchema = await this.getTableSchema(client, tableName);
        
        const validationResults: any[] = [];
        const errors: string[] = [];

        // Process each validation condition
        for (let i = 0; i < validationConditions.length; i++) {
          const condition = validationConditions[i];
          
          try {
            // Build SQL query from condition
            const { query, params } = this.buildQueryFromCondition(tableName, condition, tableSchema);
            
            // Execute the query
            const queryResult = await client.query(query, params);
            
            // Check if exactly one row was found
            const isValid = queryResult.rowCount === 1;
            
            validationResults.push({
              condition: condition,
              query: query,
              params: params,
              rowCount: queryResult.rowCount,
              isValid: isValid,
              foundData: queryResult.rows[0] || null
            });

            if (!isValid) {
              errors.push(`Condition ${i + 1} failed: Expected 1 row, found ${queryResult.rowCount} rows`);
            }

          } catch (queryError) {
            errors.push(`Condition ${i + 1} query failed: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`);
            validationResults.push({
              condition: condition,
              query: null,
              params: null,
              rowCount: 0,
              isValid: false,
              error: queryError instanceof Error ? queryError.message : 'Unknown error'
            });
          }
        }

        const allValid = errors.length === 0;

        return {
          success: allValid,
          output: {
            validationResults: validationResults,
            totalConditions: validationConditions.length,
            validConditions: validationResults.filter(r => r.isValid).length,
            errors: errors.length > 0 ? errors : undefined
          }
        };

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

  private async getTableSchema(client: any, tableName: string): Promise<any[]> {
    const schema = Config.get('actions.postgresql.schema');
    
    if (!schema) {
      throw new Error('PostgreSQL schema configuration is required. Please set actions.postgresql.schema in config.yaml');
    }
    
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = $2
      ORDER BY ordinal_position;
    `;
    
    const result = await client.query(schemaQuery, [tableName, schema]);
    
    if (result.rows.length === 0) {
      throw new Error(`Table '${tableName}' not found in schema '${schema}' or has no accessible columns`);
    }
    
    return result.rows;
  }

  private buildQueryFromCondition(tableName: string, condition: any, tableSchema: any[]): { query: string; params: any[] } {
    const whereClause: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Get schema name from config
    const schema = Config.get('actions.postgresql.schema');
    
    if (!schema) {
      throw new Error('PostgreSQL schema configuration is required. Please set actions.postgresql.schema in config.yaml');
    }
    
    const fullTableName = `${schema}.${tableName}`;

    // Build WHERE conditions for each field in the condition
    Object.entries(condition).forEach(([columnName, value]) => {
      // Check if column exists in table schema
      const columnInfo = tableSchema.find(col => col.column_name === columnName);
      if (!columnInfo) {
        throw new Error(`Column '${columnName}' not found in table '${tableName}'`);
      }

      if (value === '[null]') {
        // Handle NULL check
        whereClause.push(`${columnName} IS NULL`);
      } else if (value === '[!null]') {
        // Handle NOT NULL check
        whereClause.push(`${columnName} IS NOT NULL`);
      } else if (Array.isArray(value) && value.length === 1) {
        // Handle array values like [54] - extract the actual value
        whereClause.push(`${columnName} = $${paramIndex}`);
        params.push(value[0]);
        paramIndex++;
      } else {
        // Handle regular value comparison
        whereClause.push(`${columnName} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    const query = `SELECT * FROM ${fullTableName} WHERE ${whereClause.join(' AND ')}`;
    
    return { query, params };
  }

  private validateStepDefinition(step: StepDefinition): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!step.params) {
      errors.push('Parameters are required');
      return { success: false, errors };
    }

    if (!step.params.table) {
      errors.push('Table name is required');
    }

    if (typeof step.params.table !== 'string') {
      errors.push('Table name must be a string');
    }

    if (!step.params.responseValidation) {
      errors.push('responseValidation is required');
    }

    if (!Array.isArray(step.params.responseValidation)) {
      errors.push('responseValidation must be an array of conditions');
    }

    if (step.params.responseValidation && Array.isArray(step.params.responseValidation)) {
      if (step.params.responseValidation.length === 0) {
        errors.push('responseValidation must contain at least one condition');
      }

      step.params.responseValidation.forEach((condition: any, index: number) => {
        if (typeof condition !== 'object' || condition === null) {
          errors.push(`Condition ${index + 1} must be an object`);
        } else {
          const keys = Object.keys(condition);
          if (keys.length === 0) {
            errors.push(`Condition ${index + 1} must have at least one field`);
          }
        }
      });
    }

    return { success: errors.length === 0, errors };
  }
}
