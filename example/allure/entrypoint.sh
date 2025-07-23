#!/bin/bash

# Check if allure-results directory exists and has content
if [ ! -d "/app/allure-results" ] || [ -z "$(ls -A /app/allure-results)" ]; then
    echo "Error: No allure-results found. Please mount your results directory to /app/allure-results"
    exit 1
fi

echo "Allure results directory: /app/allure-results"
echo "Available results:"
ls -la /app/allure-results/

# Check if we should generate HTML or serve
if [ "$1" = "generate" ]; then
    echo "Generating HTML report..."
    if [ ! -d "/app/allure-report" ]; then
        mkdir -p /app/allure-report
    fi
    allure generate /app/allure-results --output /app/allure-report --clean --single-file
    echo "HTML report generated in /app/allure-report"
    ls -la /app/allure-report/
else
    echo "Starting Allure server on port 8083..."
    # Generate and serve the report
    allure serve /app/allure-results --host 0.0.0.0 --port 8083
fi