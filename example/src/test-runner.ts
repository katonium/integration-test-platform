import { TestEngine } from '../../core/src/TestEngine';
import { AllureReporter } from '../../core/src/reporters/AllureReporter';
import { Config } from '../../core/src/Config';
import { EchoAction } from '../../core/src/actions/EchoAction';
import { NopAction } from '../../core/src/actions/NopAction';
import { FailAction } from '../../core/src/actions/FailAction';
import { RestApiCallAction } from '../../core/src/actions/RestApiAction';
import { PostgreSQLAction } from '../../core/src/actions/PostgreSQLAction';
import * as path from 'path';
import * as fs from 'fs';

async function findTestFiles(targetPath: string): Promise<string[]> {
  const fullPath = path.resolve(targetPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Path does not exist: ${targetPath}`);
  }
  
  const stat = fs.statSync(fullPath);
  
  if (stat.isFile()) {
    if (fullPath.endsWith('.yaml') || fullPath.endsWith('.yml')) {
      return [fullPath];
    } else {
      throw new Error(`File is not a YAML file: ${targetPath}`);
    }
  }
  
  if (stat.isDirectory()) {
    const testFiles: string[] = [];
    const entries = fs.readdirSync(fullPath);
    
    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry);
      const entryStat = fs.statSync(entryPath);
      
      if (entryStat.isDirectory()) {
        // Recursive directory search
        const subFiles = await findTestFiles(entryPath);
        testFiles.push(...subFiles);
      } else if (entryStat.isFile() && (entry.endsWith('.yaml') || entry.endsWith('.yml'))) {
        testFiles.push(entryPath);
      }
    }
    
    return testFiles.sort();
  }
  
  return [];
}

async function runTests() {
  try {
    console.log('🚀 Starting Test Engine...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const targets = args.length > 0 ? args : ['./test-cases'];
    
    // Initialize reporter
    const reporter = new AllureReporter('./allure-results');
    
    // Load configuration
    Config.load('./config.yaml');

    // Initialize engine with config
    const engine = new TestEngine(reporter);
    
    // Register all actions
    engine.registerAction('Echo', new EchoAction());
    engine.registerAction('Nop', new NopAction());
    engine.registerAction('Fail', new FailAction());
    engine.registerAction('RestApiCall', new RestApiCallAction());
    engine.registerAction('PostgreSQL', new PostgreSQLAction());
    
    console.log('📝 Configuration loaded:');
    console.log(`  Base URL: ${Config.get('baseUrl')}`);
    console.log(`  Database Host: ${Config.get('database.host')}`);
    console.log(`  API Timeout: ${Config.get('api.timeout')}`);
    
    // Collect all test files
    const allTestFiles: string[] = [];
    for (const target of targets) {
      const testFiles = await findTestFiles(target);
      allTestFiles.push(...testFiles);
    }
    
    if (allTestFiles.length === 0) {
      console.log('⚠️ No test files found');
      return;
    }
    
    console.log(`\n📋 Found ${allTestFiles.length} test file(s):`);
    allTestFiles.forEach(file => console.log(`  - ${path.relative('.', file)}`));
    
    // Execute all test files
    let totalPassed = 0;
    let totalFailed = 0;
    
    for (const testFile of allTestFiles) {
      const relativePath = path.relative('.', testFile);
      console.log(`\n🔍 Running ${relativePath}...`);
      
      try {
        const result = await engine.executeTestCase(testFile);
        if (result) {
          console.log(`✅ ${relativePath}: PASS`);
          totalPassed++;
        } else {
          console.log(`❌ ${relativePath}: FAIL`);
          totalFailed++;
        }
      } catch (error) {
        console.error(`💥 ${relativePath}: ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (error instanceof Error && error.stack) {
          console.error('Stack trace:', error.stack);
        }
        totalFailed++;
      }
    }
    
    // Generate reports
    console.log('\n📊 Generating Allure reports...');
    await engine.generateReport();
    console.log('✅ Reports generated in ./allure-results');
    
    // Summary
    console.log('\n📈 Test Summary:');
    console.log(`  Total: ${totalPassed + totalFailed}`);
    console.log(`  Passed: ${totalPassed}`);
    console.log(`  Failed: ${totalFailed}`);
    
    if (totalFailed > 0) {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed!');
    }
    
  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  }
}

runTests();