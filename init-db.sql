-- Create test schema
CREATE SCHEMA IF NOT EXISTS test_schema;

-- Create test user for application
CREATE USER test_app_user WITH PASSWORD 'app_password';

-- Grant permissions to test user
GRANT USAGE ON SCHEMA test_schema TO test_app_user;
GRANT CREATE ON SCHEMA test_schema TO test_app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA test_schema TO test_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA test_schema TO test_app_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA test_schema GRANT ALL ON TABLES TO test_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA test_schema GRANT ALL ON SEQUENCES TO test_app_user;

-- Create test tables in test_schema
CREATE TABLE IF NOT EXISTS test_schema.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    age INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_schema.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES test_schema.users(id),
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO test_schema.users (name, email, age) VALUES 
    ('John Doe', 'john@example.com', 30),
    ('Jane Smith', 'jane@example.com', 25),
    ('Bob Johnson', 'bob@example.com', 35)
ON CONFLICT (email) DO NOTHING;

INSERT INTO test_schema.orders (user_id, product_name, quantity, price) VALUES 
    (1, 'Laptop', 1, 999.99),
    (2, 'Mouse', 2, 25.50),
    (1, 'Keyboard', 1, 75.00)
ON CONFLICT DO NOTHING;