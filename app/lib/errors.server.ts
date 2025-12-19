// Custom error classes for better error handling

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AppNotFoundError extends Error {
  constructor(message: string = "App not found") {
    super(message);
    this.name = "AppNotFoundError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string = "Database operation failed") {
    super(message);
    this.name = "DatabaseError";
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class PermissionError extends Error {
  constructor(message: string = "Permission denied") {
    super(message);
    this.name = "PermissionError";
  }
}

export class MetaApiError extends Error {
  code: number;
  
  constructor(message: string, code: number = 0) {
    super(message);
    this.name = "MetaApiError";
    this.code = code;
  }
}
