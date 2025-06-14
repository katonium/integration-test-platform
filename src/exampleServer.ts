import * as http from 'http';

export class ExampleServer {
    private server: http.Server
    
    constructor() {
    this.server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    console.log(`\n--- Incoming Request ---`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);

    // Set response headers from request headers
    for (const key in req.headers) {
        if (req.headers.hasOwnProperty(key)) {
        // 'connection' and 'transfer-encoding' headers are often problematic to echo directly
        // and are typically handled by the HTTP server itself.
        // You might need to adjust this list based on specific needs.
        if (key.toLowerCase() !== 'connection' && key.toLowerCase() !== 'transfer-encoding') {
            const headerValue = req.headers[key];
            if (headerValue !== undefined) {
                res.setHeader(key, headerValue);
            }
        }
        }
    }

    // Set a default status code, though ideally it should reflect the client's intent
    // For a simple echo, 200 OK is common.
    res.statusCode = req.statusCode || 200;

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString(); // convert Buffer to string
    });

    req.on('end', () => {
        console.log(`Body: ${body}`);
        console.log(`--- End of Request ---`);

        // Echo back the body
        res.end(body);
    });

    req.on('error', (err) => {
        console.error('Request error:', err);
        res.statusCode = 500;
        res.end('Server error');
    });

    res.on('error', (err) => {
        console.error('Response error:', err);
    });
    });
}
    public start() {
    console.log('Starting Example Server...');

    const PORT = process.env.PORT || 3000;
    this.server.listen(PORT, () => {
    console.log(`Example server listening on port ${PORT}`);
    });
    this.server.on('error', (err) => {
        console.error('Server error:', err);
    });
    }
    public stop() {
    console.log('Stopping Example Server...');
    this.server.close((err) => {
        if (err) {
            console.error('Error stopping server:', err);
        } else {
            console.log('Server stopped successfully.');
        }
    }
    );
}
}
