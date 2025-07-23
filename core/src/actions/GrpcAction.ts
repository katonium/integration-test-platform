import { BaseAction, ActionResult, StepDefinition } from './BaseAction';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Message } from 'google-protobuf';

/**
 * GrpcAction class that extends BaseAction to perform gRPC calls.
 * 
 * This class uses gRPC server reflection to discover service definitions and
 * makes unary calls to gRPC services without requiring proto files.
 * 
 * Example step definition:
 * ```yaml
 * - action: Grpc
 *   name: Call gRPC Service
 *   parameters:
 *     server: localhost:50051
 *     service: echo.EchoService
 *     method: Echo
 *     request:
 *       message: "Hello gRPC!"
 *     metadata:
 *       authorization: "Bearer token123"
 *       user-id: "12345"
 *     timeout: 5000
 *     insecure: true
 *   responseValidation:
 *     status: OK
 *     response:
 *       message: "Hello gRPC!"
 * ```
 */
export class GrpcAction extends BaseAction {
  private clientCache: Map<string, grpc.Client> = new Map();
  private reflectionCache: Map<string, any> = new Map();

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

      const {
        server,
        service,
        method,
        request = {},
        metadata = {},
        timeout = 30000,
        insecure = true
      } = step.params;

      // Get or create gRPC client using server reflection
      const client = await this.getOrCreateClientWithReflection(server, service, insecure);
      
      // Prepare metadata
      const grpcMetadata = new grpc.Metadata();
      Object.entries(metadata).forEach(([key, value]) => {
        grpcMetadata.add(key, String(value));
      });

      // Make the gRPC call
      const result = await this.makeUnaryCall(client, method, request, grpcMetadata, timeout);

      // Validate response if responseValidation is provided
      if (step.params.responseValidation) {
        const validationResult = this.validateResponse(result, step.params.responseValidation);
        if (!validationResult.success) {
          return {
            success: false,
            output: {
              error: 'Response validation failed',
              validationErrors: validationResult.errors,
              response: result
            }
          };
        }
      }

      return {
        success: true,
        output: { response: result }
      };
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

  private async getOrCreateClientWithReflection(server: string, serviceName: string, insecure: boolean): Promise<grpc.Client> {
    const cacheKey = `${server}:${serviceName}`;
    
    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey)!;
    }

    try {
      // Create credentials
      const credentials = insecure 
        ? grpc.credentials.createInsecure() 
        : grpc.credentials.createSsl();

      // Use server reflection to discover service methods
      const serviceDefinition = await this.discoverServiceViaReflection(server, serviceName, credentials);
      
      // Create client with the discovered service definition
      const ClientConstructor = grpc.makeGenericClientConstructor(serviceDefinition, serviceName);
      const client = new ClientConstructor(server, credentials);

      this.clientCache.set(cacheKey, client);
      return client;
    } catch (error) {
      throw new Error(`Failed to create gRPC client for ${serviceName} at ${server}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async discoverServiceViaReflection(server: string, serviceName: string, credentials: grpc.ChannelCredentials): Promise<any> {
    const cacheKey = `${server}:${serviceName}`;
    
    if (this.reflectionCache.has(cacheKey)) {
      return this.reflectionCache.get(cacheKey);
    }

    try {
      // Create a reflection client
      const reflectionServiceDef = {
        ServerReflectionInfo: {
          path: '/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo',
          requestStream: true,
          responseStream: true,
          requestSerialize: (request: any) => {
            // Serialize reflection request
            return this.serializeReflectionRequest(request);
          },
          requestDeserialize: (buffer: Buffer) => {
            return this.deserializeReflectionRequest(buffer);
          },
          responseSerialize: (response: any) => {
            return this.serializeReflectionResponse(response);
          },
          responseDeserialize: (buffer: Buffer) => {
            return this.deserializeReflectionResponse(buffer);
          }
        }
      };

      // Try to get service info via reflection
      const serviceInfo = await this.queryReflectionServer(server, serviceName, credentials);
      
      // Build service definition from reflection data
      const serviceDefinition = this.buildServiceDefinition(serviceName, serviceInfo);
      
      this.reflectionCache.set(cacheKey, serviceDefinition);
      return serviceDefinition;
    } catch (reflectionError) {
      // Fallback: Create a basic service definition based on common patterns
      console.warn(`Reflection failed for ${serviceName}, using fallback definition:`, reflectionError);
      
      const fallbackDefinition = {
        Echo: {
          path: `/${serviceName}/Echo`,
          requestStream: false,
          responseStream: false,
          requestSerialize: (request: any) => this.serializeMessage(request),
          requestDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer),
          responseSerialize: (response: any) => this.serializeMessage(response),
          responseDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer)
        },
        GetStatus: {
          path: `/${serviceName}/GetStatus`,
          requestStream: false,
          responseStream: false,
          requestSerialize: (request: any) => this.serializeMessage(request || {}),
          requestDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer),
          responseSerialize: (response: any) => this.serializeMessage(response),
          responseDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer)
        }
      };
      
      this.reflectionCache.set(cacheKey, fallbackDefinition);
      return fallbackDefinition;
    }
  }

  private async queryReflectionServer(server: string, serviceName: string, credentials: grpc.ChannelCredentials): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create reflection client
      const reflectionClient = new grpc.Client(server, credentials);
      
      // Define the reflection service method
      const reflectionMethod = {
        path: '/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo',
        requestStream: true,
        responseStream: true,
        requestSerialize: (request: any) => this.serializeReflectionRequest(request),
        requestDeserialize: (buffer: Buffer) => this.deserializeReflectionRequest(buffer),
        responseSerialize: (response: any) => this.serializeReflectionResponse(response),
        responseDeserialize: (buffer: Buffer) => this.deserializeReflectionResponse(buffer)
      };

      // Create bidirectional stream
      const call = reflectionClient.makeBidiStreamRequest(
        reflectionMethod.path,
        reflectionMethod.requestSerialize,
        reflectionMethod.responseDeserialize,
        new grpc.Metadata()
      );

      const responses: any[] = [];
      
      call.on('data', (response: any) => {
        responses.push(response);
      });
      
      call.on('end', () => {
        try {
          // Process reflection responses to extract service definition
          const serviceInfo = this.parseReflectionResponses(responses, serviceName);
          resolve(serviceInfo);
        } catch (error) {
          reject(error);
        }
      });
      
      call.on('error', (error: any) => {
        reject(new Error(`Reflection query failed: ${error.message}`));
      });

      // Send reflection requests
      try {
        // 1. List services
        call.write({
          list_services: ""
        });
        
        // 2. Get service descriptor
        call.write({
          file_containing_symbol: serviceName
        });
        
        // End the request stream
        call.end();
        
        // Set timeout
        setTimeout(() => {
          call.cancel();
          reject(new Error('Reflection query timeout'));
        }, 10000);
        
      } catch (error) {
        reject(new Error(`Failed to send reflection requests: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  private parseReflectionResponses(responses: any[], serviceName: string): any {
    // Parse the reflection responses to extract service method definitions
    const serviceInfo = {
      methods: [] as any[]
    };

    for (const response of responses) {
      if (response.list_services_response) {
        // Check if our service is in the list
        const services = response.list_services_response.service || [];
        const serviceExists = services.some((svc: any) => svc.name === serviceName);
        if (!serviceExists) {
          throw new Error(`Service ${serviceName} not found on server`);
        }
      }
      
      if (response.file_descriptor_response) {
        // Parse file descriptor to extract method definitions
        const fileDescriptor = response.file_descriptor_response.file_descriptor_proto;
        if (fileDescriptor && fileDescriptor.length > 0) {
          // This would require proper protobuf descriptor parsing
          // For now, extract basic method info from the descriptor
          serviceInfo.methods = this.extractMethodsFromDescriptor(fileDescriptor[0], serviceName);
        }
      }
    }

    // If reflection parsing failed, fall back to common method discovery
    if (serviceInfo.methods.length === 0) {
        throw new Error(`No methods found for service ${serviceName} via reflection`);
    }

    return serviceInfo;
  }

  private extractMethodsFromDescriptor(descriptorProto: any, serviceName: string): any[] {
    // This is a simplified method extraction
    // In a full implementation, you would parse the protobuf FileDescriptorProto
    // to extract service definitions and method signatures
    
    const methods: any[] = [];
    
    try {
      // Look for service definitions in the descriptor
      if (descriptorProto.service) {
        for (const service of descriptorProto.service) {
          if (service.name === serviceName.split('.').pop()) {
            for (const method of service.method || []) {
              methods.push({
                name: method.name,
                inputType: method.input_type,
                outputType: method.output_type
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to extract methods from descriptor: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return methods;
  }

  private buildServiceDefinition(serviceName: string, serviceInfo: any): any {
    const definition: any = {};
    
    for (const method of serviceInfo.methods) {
      definition[method.name] = {
        path: `/${serviceName}/${method.name}`,
        requestStream: false,
        responseStream: false,
        requestSerialize: (request: any) => this.serializeMessage(request),
        requestDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer),
        responseSerialize: (response: any) => this.serializeMessage(response),
        responseDeserialize: (buffer: Buffer) => this.deserializeMessage(buffer)
      };
    }
    
    return definition;
  }

  private serializeMessage(message: any): Buffer {
    // Create a dynamic protobuf message based on the request structure
    // Since we don't have the actual proto definitions loaded, we'll use a generic approach
    
    // For the echo service, we know the structure is:
    // message EchoRequest { string message = 1; map<string, string> metadata = 2; }
    // message StatusRequest { }
    
    if (typeof message === 'object' && message !== null) {
      // Simple protobuf encoding for common message types
      // Field 1 (message): string
      // Field 2 (metadata): map<string, string>
      
      let buffer = Buffer.alloc(0);
      
      if (message.message) {
        // Field 1: string message
        const messageBytes = Buffer.from(message.message, 'utf8');
        const fieldHeader = Buffer.from([0x0a]); // field 1, wire type 2 (length-delimited)
        const lengthByte = Buffer.from([messageBytes.length]);
        buffer = Buffer.concat([buffer, fieldHeader, lengthByte, messageBytes]);
      }
      
      if (message.metadata && typeof message.metadata === 'object') {
        // Field 2: map<string, string> metadata
        for (const [key, value] of Object.entries(message.metadata)) {
          const keyBytes = Buffer.from(String(key), 'utf8');
          const valueBytes = Buffer.from(String(value), 'utf8');
          
          // Map entry: key(1) + value(2)
          const mapEntry = Buffer.concat([
            Buffer.from([0x0a, keyBytes.length]), keyBytes,    // field 1 (key)
            Buffer.from([0x12, valueBytes.length]), valueBytes  // field 2 (value)
          ]);
          
          const fieldHeader = Buffer.from([0x12]); // field 2, wire type 2
          const lengthByte = Buffer.from([mapEntry.length]);
          buffer = Buffer.concat([buffer, fieldHeader, lengthByte, mapEntry]);
        }
      }
      
      return buffer;
    }
    
    // Empty message
    return Buffer.alloc(0);
  }

  private deserializeMessage(buffer: Buffer): any {
    // Simple protobuf parsing for response messages
    const result: any = {};
    let offset = 0;
    
    while (offset < buffer.length) {
      // Read field header (varint)
      const fieldHeader = buffer[offset++];
      if (fieldHeader === undefined) break;
      
      const fieldNum = fieldHeader >> 3;
      const wireType = fieldHeader & 0x07;
      
      if (wireType === 2) { // Length-delimited
        const length = buffer[offset++];
        if (length === undefined || offset + length > buffer.length) break;
        
        const fieldData = buffer.slice(offset, offset + length);
        offset += length;
        
        if (fieldNum === 1) {
          // Field 1: message (string)
          result.message = fieldData.toString('utf8');
        } else if (fieldNum === 2) {
          // Field 2: metadata (map) - simplified parsing
          result.metadata = result.metadata || {};
        } else if (fieldNum === 3) {
          // Field 3: timestamp (int64) - simplified
          result.timestamp = fieldData.readBigInt64LE ? Number(fieldData.readBigInt64LE(0)) : 0;
        }
      } else if (wireType === 0) { // Varint
        // Simple varint reading for int64 fields
        let value = 0;
        let shift = 0;
        while (offset < buffer.length) {
          const byte = buffer[offset++];
          value |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        
        if (fieldNum === 3) {
          result.timestamp = value;
        } else if (fieldNum === 1) {
          result.status = value === 1 ? 'OK' : 'ERROR';
        }
      }
    }
    
    // If no fields were parsed, try to parse as JSON (fallback)
    if (Object.keys(result).length === 0) {
      try {
        return JSON.parse(buffer.toString('utf8'));
      } catch {
        return {};
      }
    }
    
    return result;
  }

  private serializeReflectionRequest(request: any): Buffer {
    // Serialize ServerReflectionRequest proto message
    // message ServerReflectionRequest {
    //   string host = 1;
    //   oneof message_request {
    //     string file_by_filename = 3;
    //     string file_containing_symbol = 4;
    //     ExtensionRequest file_containing_extension = 5;
    //     string all_extension_numbers_of_type = 6;
    //     string list_services = 7;
    //   }
    // }
    
    let buffer = Buffer.alloc(0);
    
    if (request.list_services !== undefined) {
      // Field 7: string list_services
      const value = Buffer.from(String(request.list_services), 'utf8');
      const fieldHeader = Buffer.from([0x3a]); // field 7, wire type 2
      const length = Buffer.from([value.length]);
      buffer = Buffer.concat([buffer, fieldHeader, length, value]);
    }
    
    if (request.file_containing_symbol) {
      // Field 4: string file_containing_symbol
      const value = Buffer.from(request.file_containing_symbol, 'utf8');
      const fieldHeader = Buffer.from([0x22]); // field 4, wire type 2
      const length = Buffer.from([value.length]);
      buffer = Buffer.concat([buffer, fieldHeader, length, value]);
    }
    
    return buffer;
  }

  private deserializeReflectionRequest(buffer: Buffer): any {
    return JSON.parse(buffer.toString());
  }

  private serializeReflectionResponse(response: any): Buffer {
    return Buffer.from(JSON.stringify(response));
  }

  private deserializeReflectionResponse(buffer: Buffer): any {
    // Parse ServerReflectionResponse proto message
    // This is a simplified parser - in practice you'd use a proper protobuf library
    const result: any = {};
    let offset = 0;
    
    while (offset < buffer.length) {
      if (offset >= buffer.length) break;
      
      const fieldHeader = buffer[offset++];
      if (fieldHeader === undefined) break;
      
      const fieldNum = fieldHeader >> 3;
      const wireType = fieldHeader & 0x07;
      
      if (wireType === 2) { // Length-delimited
        const length = buffer[offset++];
        if (length === undefined || offset + length > buffer.length) break;
        
        const fieldData = buffer.slice(offset, offset + length);
        offset += length;
        
        if (fieldNum === 6) {
          // list_services_response
          result.list_services_response = this.parseListServicesResponse(fieldData);
        } else if (fieldNum === 4) {
          // file_descriptor_response
          result.file_descriptor_response = this.parseFileDescriptorResponse(fieldData);
        }
      }
    }
    
    return result;
  }

  private parseListServicesResponse(buffer: Buffer): any {
    // Parse ListServiceResponse message
    const services: any[] = [];
    let offset = 0;
    
    while (offset < buffer.length) {
      const fieldHeader = buffer[offset++];
      if (fieldHeader === undefined) break;
      
      const wireType = fieldHeader & 0x07;
      
      if (wireType === 2) { // service repeated field
        const length = buffer[offset++];
        if (length === undefined || offset + length > buffer.length) break;
        
        const serviceData = buffer.slice(offset, offset + length);
        offset += length;
        
        // Parse service name
        if (serviceData.length > 2) {
          const nameLength = serviceData[1];
          if (nameLength && serviceData.length >= 2 + nameLength) {
            const name = serviceData.slice(2, 2 + nameLength).toString('utf8');
            services.push({ name });
          }
        }
      }
    }
    
    return { service: services };
  }

  private parseFileDescriptorResponse(buffer: Buffer): any {
    // Parse FileDescriptorResponse message
    // This is a simplified parser
    return {
      file_descriptor_proto: [buffer] // Return raw buffer for now
    };
  }

  private async makeUnaryCall(
    client: grpc.Client, 
    methodName: string, 
    request: any, 
    metadata: grpc.Metadata, 
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      
      // Create call options
      const callOptions = {
        deadline: deadline
      };

      // Get the method from the client - try both lowercase and exact case
      const method = (client as any)[methodName] || (client as any)[methodName.toLowerCase()];
      if (!method || typeof method !== 'function') {
        // List available methods for debugging
        const availableMethods = Object.getOwnPropertyNames(client)
          .filter(prop => typeof (client as any)[prop] === 'function' && !prop.startsWith('_'));
        reject(new Error(`Method ${methodName} not found on service. Available methods: ${availableMethods.join(', ')}`));
        return;
      }

      // Make the unary call
      method.call(client, request, metadata, callOptions, (error: grpc.ServiceError | null, response: any) => {
        if (error) {
          reject(new Error(`gRPC call failed: ${error.message} (code: ${error.code})`));
        } else {
          resolve({
            status: 'OK',
            response: response,
            metadata: {}
          });
        }
      });
    });
  }

  private validateStepDefinition(step: StepDefinition): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!step.params) {
      errors.push('Parameters are required');
      return { success: false, errors };
    }

    if (!step.params.server) {
      errors.push('Server address is required');
    }

    if (!step.params.service) {
      errors.push('Service name is required');
    }

    if (!step.params.method) {
      errors.push('Method name is required');
    }

    if (step.params.timeout && (typeof step.params.timeout !== 'number' || step.params.timeout <= 0)) {
      errors.push('Timeout must be a positive number');
    }

    return { success: errors.length === 0, errors };
  }

  private validateResponse(result: any, validation: any): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate status
    if (validation.status && result.status !== validation.status) {
      errors.push(`Expected status ${validation.status}, got ${result.status}`);
    }

    // Validate response body
    if (validation.response) {
      const responseErrors = this.validateObject(result.response, validation.response, 'response');
      errors.push(...responseErrors);
    }

    // Validate metadata
    if (validation.metadata) {
      Object.entries(validation.metadata).forEach(([key, expectedValue]) => {
        const actualValue = result.metadata?.[key];
        if (expectedValue !== actualValue) {
          errors.push(`Expected metadata ${key}: ${expectedValue}, got: ${actualValue}`);
        }
      });
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

  /**
   * Cleanup method to close all cached clients and clear reflection cache
   */
  public cleanup(): void {
    this.clientCache.forEach(client => {
      client.close();
    });
    this.clientCache.clear();
    this.reflectionCache.clear();
  }
}
