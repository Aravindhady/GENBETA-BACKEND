export const sendResponse = (res, statusCode, message, data = null, error = null) => {
  res.status(statusCode).json({
    success: statusCode >= 200 && statusCode < 300,
    message,
    data,
    ...(error && { error })
  });
};

