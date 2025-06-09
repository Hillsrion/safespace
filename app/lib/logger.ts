/**
 * Simple logger utility that can be extended with more features later
 * Provides consistent logging format and error handling
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const formatMessage = (level: LogLevel, message: string, meta?: LogMeta) => {
  try {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    });
  } catch (error) {
    console.error("Failed to format log message:", error);
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Failed to format log message",
      originalMessage: message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Logger instance with different log levels
 */
export const logger = {
  /**
   * Log a debug message
   * @param message The message to log
   * @param meta Additional metadata to include in the log
   */
  debug: (message: string, meta?: LogMeta) => {
    console.debug(formatMessage("debug", message, meta));
  },

  /**
   * Log an informational message
   * @param message The message to log
   * @param meta Additional metadata to include in the log
   */
  info: (message: string, meta?: LogMeta) => {
    console.info(formatMessage("info", message, meta));
  },

  /**
   * Log a warning message
   * @param message The message to log
   * @param meta Additional metadata to include in the log
   */
  warn: (message: string, meta?: LogMeta) => {
    console.warn(formatMessage("warn", message, meta));
  },

  /**
   * Log an error message or Error object
   * @param message The error message or Error object
   * @param meta Additional metadata to include in the log
   */
  error: (message: string | Error, meta?: LogMeta) => {
    const errorMessage = message instanceof Error ? message.message : message;
    const errorStack = message instanceof Error ? message.stack : undefined;

    console.error(
      formatMessage("error", errorMessage, {
        ...meta,
        ...(errorStack && { stack: errorStack }),
        ...(message instanceof Error && {
          error: { name: message.name, message: message.message },
        }),
      })
    );
  },
};
