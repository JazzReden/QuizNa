import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response, Request } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const oversized =
      typeof exception === "object" &&
      exception !== null &&
      "type" in exception &&
      exception.type === "entity.too.large";
    const parserStatus =
      typeof exception === "object" && exception !== null && "type" in exception
        ? (
            {
              "entity.parse.failed": 400,
              "encoding.unsupported": 415,
              "charset.unsupported": 415,
            } as Record<string, number>
          )[String(exception.type)]
        : undefined;
    const status = oversized
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : (parserStatus ??
        (exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR));

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = "Internal server error";

    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      message =
        (exceptionResponse as any).message ||
        (exceptionResponse as any).error ||
        message;
    } else if (typeof exceptionResponse === "string") {
      message = exceptionResponse;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (parserStatus)
      message =
        parserStatus === 400
          ? "The request body is not valid JSON."
          : "This request encoding is not supported.";
    if (status === 503) response.setHeader("Retry-After", "5");
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      response.setHeader("Retry-After", "60");
      message = "Too many requests. Please wait a minute and try again.";
    }
    if (oversized) message = "Request too large. Send less data and retry.";
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - Error: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        status >= 500
          ? "Service temporarily unavailable. Please retry."
          : message,
    });
  }
}
