-- Initialize database schema for testing
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    age INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample data
INSERT INTO users (name, email, age) VALUES 
('John Doe', 'john@example.com', 28),
('Jane Smith', 'jane@example.com', 32)
ON CONFLICT (email) DO NOTHING;