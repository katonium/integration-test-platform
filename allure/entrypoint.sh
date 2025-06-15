#!/bin/bash

# Check if allure-results directory exists and has content
if [ ! -d "/app/allure-results" ] || [ -z "$(ls -A /app/allure-results)" ]; then
    echo "Error: No allure-results found. Please mount your results directory to /app/allure-results"
    exit 1
fi

echo "Starting Allure server on port 8080..."
echo "Allure results directory: /app/allure-results"
echo "Available results:"
ls -la /app/allure-results/

# Generate and serve the report
allure serve /app/allure-results --host 0.0.0.0 --port 8083