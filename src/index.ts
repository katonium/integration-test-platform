#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { TestEngine } from './testEngine';
import { TestEngineConfig } from './types';
import YAML from 'yamljs';
import fs from 'fs';
import { ExampleServer } from './exampleServer';

const program = new Command();

const configContent = fs.readFileSync("config.yaml", 'utf-8');
const config: TestEngineConfig = YAML.parse(configContent);

program
  .name('yaml-test-engine')
  .description('YAML-based test engine for PostgreSQL and REST API testing')
  .version('1.0.0');

program
  .command('run')
  .description('Run a YAML test case')
  .argument('<file>', 'YAML test case file path')
  // .option('--pg-host <host>', 'PostgreSQL host', 'localhost')
  // .option('--pg-port <port>', 'PostgreSQL port', '5432')
  // .option('--pg-database <database>', 'PostgreSQL database name')
  // .option('--pg-user <user>', 'PostgreSQL username')
  // .option('--pg-password <password>', 'PostgreSQL password')
  // .option('--base-url <url>', 'Base URL for REST API calls')
  // .option('--test-case-id <id>', 'Test case ID for template substitution')
  .action(async (file: string) => {
    try {
      console.log(chalk.blue('🔍 Starting YAML Test Engine...'));
      // const config: TestEngineConfig = {};

      // // Configure PostgreSQL if credentials provided
      // if (options.pgDatabase && options.pgUser && options.pgPassword) {
      //   console.log(chalk.blue('🔌 Configuring PostgreSQL connection...'));
      //   config.postgresql = {
      //     host: options.pgHost,
      //     port: parseInt(options.pgPort),
      //     database: options.pgDatabase,
      //     user: options.pgUser,
      //     password: options.pgPassword
      //   };
      // } else {
      //   console.log(chalk.yellow('⚠️ PostgreSQL connection not configured. Skipping database tests.'));
      //   if (!options.pgDatabase ){
      //     console.warn(chalk.yellow('   Missing PostgreSQL database name.'));
      //   }
      //   if (!options.pgUser) {
      //     console.warn(chalk.yellow('   Missing PostgreSQL username.'));
      //   }
      //   if (!options.pgPassword) {
      //     console.warn(chalk.yellow('   Missing PostgreSQL password.'));
      //   }
      // }

      // // Set base URL if provided
      // if (options.baseUrl) {
      //   config.baseUrl = options.baseUrl;
      // }

      // // Set test case ID if provided
      // if (options.testCaseId) {
      //   config.testCaseId = options.testCaseId;
      // }

      const engine = new TestEngine(config);

      console.log(chalk.blue('🚀 YAML Test Engine Starting...'));
      
      await engine.initialize();
      
      const testFilePath = path.resolve(file);
      const success = await engine.runTestFile(testFilePath);
      
      await engine.cleanup();

      if (success) {
        console.log(chalk.green('\n🎉 All tests passed!'));
        process.exit(0);
      } else {
        console.log(chalk.red('\n💥 Some tests failed!'));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red(`❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a YAML test case file')
  .argument('<file>', 'YAML test case file path')
  .action(async (file: string) => {
    try {
      const testFilePath = path.resolve(file);
      
      if (!fs.existsSync(testFilePath)) {
        throw new Error(`Test file not found: ${testFilePath}`);
      }

      const yamlContent = fs.readFileSync(testFilePath, 'utf-8');
      const testCase = YAML.parse(yamlContent);

      // Basic validation
      if (!testCase.kind || testCase.kind !== 'TestCase') {
        throw new Error('Invalid test case: missing or incorrect kind field');
      }

      if (!testCase.name) {
        throw new Error('Invalid test case: missing name field');
      }

      if (!testCase.step || !Array.isArray(testCase.step)) {
        throw new Error('Invalid test case: missing or invalid step field');
      }

      console.log(chalk.green(`✅ Test case '${testCase.name}' is valid`));
      console.log(chalk.gray(`   Steps: ${testCase.step.length}`));
      
      for (let i = 0; i < testCase.step.length; i++) {
        const step = testCase.step[i];
        console.log(chalk.gray(`   ${i + 1}. ${step.name} (${step.kind})`));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Validation failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help();
}


// launch echo-back server for testing
const server: ExampleServer = new ExampleServer();
server.start();

program.parse();