import { TestEngine } from '../../core/src/TestEngine';
import { ActionRegistry } from '../../core/src/ActionRegistry';
import { AllureReporter } from '../../core/src/reporters/AllureReporter';
import { Config } from '../../core/src/Config';
import { EchoAction } from '../../core/src/actions/EchoAction';
import { NopAction } from '../../core/src/actions/NopAction';
import { FailAction } from '../../core/src/actions/FailAction';
import { RestApiCallAction } from '../../core/src/actions/RestApiAction';
import { PostgreSQLAction } from '../../core/src/actions/PostgreSQLAction';
import { StepDefinition } from '../../core/src/actions/BaseAction';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yamljs';

// Helper function to get all steps from test files
async function getAllStepsFromFiles(testFiles: string[]): Promise<StepDefinition[]> {
  const allSteps: StepDefinition[] = [];
  
  for (const testFile of testFiles) {
    try {
      const yamlContent = fs.readFileSync(testFile, 'utf8');
      const testCase = YAML.parse(yamlContent);
      if (testCase.step && Array.isArray(testCase.step)) {
        // ID自動付与
        testCase.step.forEach((step: any, idx: number) => {
          if (!step.id) step.id = `#${idx + 1}`;
        });
        allSteps.push(...testCase.step);
      }
    } catch (error) {
      console.error(`Error reading test file ${testFile}:`, error);
    }
  }
  
  return allSteps;
}

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
    const isRandomMode = args.includes('--random');
    const targets = args.filter(arg => arg !== '--random');
    const finalTargets = targets.length > 0 ? targets : ['./test-cases'];
    
    // Initialize reporter
    const reporter = new AllureReporter('./allure-results');
    
    // Load configuration
    Config.load('./config.yaml');

    // Initialize engine with config
    const engine = new TestEngine(reporter);

    // Helper: YAML→TestCase構築＋ID付与
    function loadTestCaseWithStepIds(testFile: string): any {
      const yamlContent = fs.readFileSync(testFile, 'utf8');
      const testCase = YAML.parse(yamlContent);
      if (testCase.step && Array.isArray(testCase.step)) {
        testCase.step.forEach((step: any, idx: number) => {
          if (!step.id) step.id = `#${idx + 1}`;
        });
      }
      return testCase;
    }
    
    console.log('📝 Configuration loaded:');
    console.log(`  Base URL: ${Config.get('baseUrl')}`);
    console.log(`  Database Host: ${Config.get('database.host')}`);
    console.log(`  API Timeout: ${Config.get('api.timeout')}`);
    
    // Collect all test files
    const allTestFiles: string[] = [];
    for (const target of finalTargets) {
      const testFiles = await findTestFiles(target);
      allTestFiles.push(...testFiles);
    }
    
    if (allTestFiles.length === 0) {
      console.log('⚠️ No test files found');
      return;
    }
    
    console.log(`\n📋 Found ${allTestFiles.length} test file(s):`);
    allTestFiles.forEach(file => console.log(`  - ${path.relative('.', file)}`));
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    if (isRandomMode) {
      // ランダムモード: 最初のテストケースのステップから10個ランダム実行
      const firstTestFile = allTestFiles[0];
      if (!firstTestFile) {
        console.log('⚠️ No test files found');
        return;
      }
      const testCase = loadTestCaseWithStepIds(firstTestFile);
      if (!testCase.step || testCase.step.length === 0) {
        console.log('⚠️ No test steps found in first test case');
        return;
      }
      console.log(`\n📋 Found ${testCase.step.length} step(s) in first test case`);
      console.log('🎲 Executing 10 random steps...');
      // ExecutionContextの初期化
      const executionContext = {
        testCaseId: testCase.id || testCase.name || 'random',
        testCaseName: testCase.name || 'random',
        testCase,
        testSuccess: true,
        stepResults: new Map()
      };
      
      // テスト開始を報告
      await reporter.reportTestStart(executionContext.testCaseId, executionContext.testCaseName);
      
      for (let i = 0; i < 10; i++) {
        const randomIndex = Math.floor(Math.random() * testCase.step.length);
        const randomStep = testCase.step[randomIndex];
        console.log(`\n🔍 Executing random step ${i + 1}/10: ${randomStep.id} (${randomStep.kind})`);
        try {
          const result = await engine.executeTestStep(executionContext, randomStep.id);
          if (result.success) {
            console.log(`✅ Step ${randomStep.id}: PASS`);
            totalPassed++;
          } else {
            console.log(`❌ Step ${randomStep.id}: FAIL`);
            console.log(`    Error: ${JSON.stringify(result.output, null, 2)}`);
            totalFailed++;
          }
        } catch (error) {
          console.error(`💥 Step ${randomStep.id}: ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
          if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
          }
          totalFailed++;
        }
      }
      
      // テスト終了を報告
      await reporter.reportTestEnd(executionContext.testCaseId, totalFailed === 0);
    } else {
      // 通常モード: 各テストファイルをロードし、全ステップを順次実行
      for (const testFile of allTestFiles) {
        const relativePath = path.relative('.', testFile);
        console.log(`\n🔍 Running ${relativePath}...`);
        const testCase = loadTestCaseWithStepIds(testFile);
        const executionContext = {
          testCaseId: testCase.id || testCase.name || relativePath,
          testCaseName: testCase.name || relativePath,
          testCase,
          testSuccess: true,
          stepResults: new Map()
        };
        
        // テスト開始を報告
        await reporter.reportTestStart(executionContext.testCaseId, executionContext.testCaseName);
        
        // Use the new dependency-aware execution method
        try {
          const allPassed = await engine.executeTestCase(testCase, executionContext);
          
          // テスト終了を報告
          await reporter.reportTestEnd(executionContext.testCaseId, allPassed);
          
          if (allPassed) {
            console.log(`✅ ${relativePath}: PASS`);
            totalPassed++;
          } else {
            console.log(`❌ ${relativePath}: FAIL`);
            totalFailed++;
          }
        } catch (error) {
          console.log(`❌ ${relativePath}: ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
          await reporter.reportTestEnd(executionContext.testCaseId, false);
          totalFailed++;
        }
      }
    }
    
    // Generate reports
    console.log('\n📊 Generating Allure reports...');
    await engine.generateReport();
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

async function main() {
  try {
    await runTests();
  } catch (error) {
    console.error('❌ Error in main function:', error);
    process.exit(1);
  }
}

// Register all actions
ActionRegistry.register('Echo', new EchoAction());
ActionRegistry.register('Nop', new NopAction());
ActionRegistry.register('Fail', new FailAction());
ActionRegistry.register('RestApiCall', new RestApiCallAction());
ActionRegistry.register('PostgreSQL', new PostgreSQLAction());


main().catch(error => {
  console.error('❌ Uncaught error:', error);
  process.exit(1);
});
